package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/auth"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	store       *storage.PostgresStore
	geoDetector *auth.GeoDetector
	jwtSecret   string
}

func authUserResponse(user *models.User, includeLastLogin bool) fiber.Map {
	response := fiber.Map{
		"id":             user.ID,
		"email":          user.Email,
		"handle":         user.Handle,
		"preset":         user.Preset,
		"active":         user.Active,
		"email_verified": user.EmailVerified,
		"created_at":     user.CreatedAt,
		"updated_at":     user.UpdatedAt,
	}

	if includeLastLogin {
		response["last_login_at"] = user.LastLoginAt
	}

	return response
}

func normalizeHandleInput(raw string) (string, error) {
	handle := strings.ToLower(strings.TrimSpace(raw))
	if err := models.ValidateHandle(handle); err != nil {
		return "", err
	}

	return handle, nil
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(store *storage.PostgresStore, geoDetector *auth.GeoDetector, jwtSecret string) *AuthHandler {
	return &AuthHandler{
		store:       store,
		geoDetector: geoDetector,
		jwtSecret:   jwtSecret,
	}
}

// SignUp handles user registration
// @Summary Register a new user
// @Description Create a new user account with email and password
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.CreateUserRequest true "Registration details"
// @Success 201 {object} models.LoginResponse
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/auth/signup [post]
func (h *AuthHandler) SignUp(c *fiber.Ctx) error {
	var req models.CreateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	preset := strings.TrimSpace(req.Preset)
	if preset == "" {
		preset = "dev"
	}
	preset = domainpolicy.NormalizePreset(preset)

	// Validate email uniqueness
	existingUser, err := h.store.GetUserByEmail(c.Context(), req.Email)
	if err == nil && existingUser != nil {
		return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
			Error:     "Email already exists",
			Message:   "An account with this email already exists",
			Timestamp: time.Now(),
		})
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		logger.Error("Failed to hash password", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to process password",
			Timestamp: time.Now(),
		})
	}

	// Generate API key
	apiKey := generateAPIKey()

	// Generate verification token
	verificationToken := generateToken()

	// Generate handle from email or normalize the provided handle.
	handle := req.Handle
	if handle == "" {
		// If no handle provided, generate from email username
		emailParts := strings.Split(req.Email, "@")
		handle = emailParts[0]
		// Make it URL-safe: replace dots and other special chars with hyphens
		handle = strings.ReplaceAll(handle, ".", "-")
		handle = strings.ReplaceAll(handle, "+", "-")
		// Add random suffix to ensure uniqueness
		handle = fmt.Sprintf("%s-%s", handle, uuid.New().String()[:8])
	} else {
		normalizedHandle, err := normalizeHandleInput(handle)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Error:     "Invalid handle",
				Message:   err.Error(),
				Timestamp: time.Now(),
			})
		}
		handle = normalizedHandle
	}

	// Create user
	// verificationToken is already generated above
	verificationExpires := time.Now().Add(48 * time.Hour)

	user := &models.User{
		ID:                       uuid.New(),
		Email:                    req.Email,
		PasswordHash:             string(hashedPassword),
		APIKey:                   apiKey,
		Handle:                   handle,
		Preset:                   preset,
		Active:                   true,
		EmailVerified:            false, // Set to false, user needs to verify email
		VerificationToken:        &verificationToken,
		VerificationTokenExpires: &verificationExpires,
		CreatedAt:                time.Now(),
		UpdatedAt:                time.Now(),
	}

	// Create user without subscription side effects in OSS mode.
	if err := h.store.CreateUser(c.Context(), user); err != nil {
		// Check if it's a duplicate user error
		if err == models.ErrUserAlreadyExists {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Error:     "Email already exists",
				Message:   "An account with this email already exists",
				Timestamp: time.Now(),
			})
		}
		if err == models.ErrHandleTaken {
			// Should be rare due to random suffix, but handle it
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Error:     "Handle taken",
				Message:   "User handle collision, please try again",
				Timestamp: time.Now(),
			})
		}
		if err == models.ErrHandleReserved {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Error:     "Handle reserved",
				Message:   "This handle is reserved for system use",
				Timestamp: time.Now(),
			})
		}

		logger.Error("Failed to create user",
			zap.String("email", req.Email),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Registration failed",
			Message:   "Failed to create user account",
			Timestamp: time.Now(),
		})
	}

	logger.Info("User registered successfully",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
		zap.String("policy_preset", user.Preset),
	)

	// Detect and update user geo data (non-blocking)
	if h.geoDetector != nil {
		// Extract headers before goroutine (context becomes invalid after request)
		xForwardedFor := c.Get("X-Forwarded-For")
		xRealIP := c.Get("X-Real-IP")
		remoteAddr := c.IP()
		cfCountry := c.Get("CF-IPCountry")

		go h.detectAndUpdateGeoData(user.ID, xForwardedFor, xRealIP, remoteAddr, cfCountry)
	}

	// In production, send verification email here
	// For now, we'll auto-verify in development
	// TODO: Send verification email with verificationToken

	// Generate JWT tokens
	accessToken, err := generateJWT(user.ID, 15*time.Minute, h.jwtSecret)
	if err != nil {
		logger.Error("Failed to generate access token", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to generate authentication token",
			Timestamp: time.Now(),
		})
	}

	refreshToken, err := generateJWT(user.ID, 7*24*time.Hour, h.jwtSecret)
	if err != nil {
		logger.Error("Failed to generate refresh token", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to generate authentication token",
			Timestamp: time.Now(),
		})
	}

	// Store refresh token in DB for rotation
	familyID := uuid.New()
	tokenHash := hashToken(refreshToken)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	rt := &models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		FamilyID:  familyID,
		IsRevoked: false,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
		Used:      false,
	}

	if err := h.store.StoreRefreshToken(c.Context(), rt); err != nil {
		logger.Error("Failed to store refresh token", zap.Error(err))
		// Continue anyway, but rotation won't work for this session
	}

	// Set JWT tokens as httpOnly cookies
	setAuthCookies(c, accessToken, refreshToken)

	// ✅ Return selective user fields + api_key separately (shown once on signup)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"user":          authUserResponse(user, false),
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"expires_in":    900,    // 15 minutes in seconds
		"api_key":       apiKey, // ✅ Shown once on signup
	})
}

// CheckHandleAvailability checks whether a handle is available for use.
// @Summary Check handle availability
// @Description Check whether a username handle can be claimed
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.UpdateHandleRequest true "Handle to check"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/auth/handle/check [post]
func (h *AuthHandler) CheckHandleAvailability(c *fiber.Ctx) error {
	var req models.UpdateHandleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	handle, err := normalizeHandleInput(req.Handle)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid handle",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	available, err := h.store.CheckHandleAvailability(c.Context(), handle)
	if err != nil {
		logger.Error("Failed to check handle availability",
			zap.String("handle", handle),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to check handle availability",
			Timestamp: time.Now(),
		})
	}

	response := fiber.Map{
		"available": available,
	}
	if !available {
		response["suggestions"] = models.SuggestAvailableHandle(handle)
	}

	return c.JSON(response)
}

// UpdateHandle updates the authenticated user's handle.
// @Summary Update handle
// @Description Update the current user's username handle
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.UpdateHandleRequest true "New handle"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/auth/handle [put]
func (h *AuthHandler) UpdateHandle(c *fiber.Ctx) error {
	var req models.UpdateHandleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	handle, err := normalizeHandleInput(req.Handle)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid handle",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	userVal := c.Locals("user")
	if userVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	user, ok := userVal.(*models.User)
	if !ok {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to get user data",
			Timestamp: time.Now(),
		})
	}

	if strings.EqualFold(user.Handle, handle) {
		return c.JSON(fiber.Map{
			"user": authUserResponse(user, true),
		})
	}

	if err := h.store.UpdateUserHandle(c.Context(), user.ID, handle); err != nil {
		switch err {
		case models.ErrHandleTaken:
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Error:     "Handle taken",
				Message:   "This handle is already taken",
				Timestamp: time.Now(),
			})
		case models.ErrHandleReserved:
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Error:     "Handle reserved",
				Message:   "This handle is reserved for system use",
				Timestamp: time.Now(),
			})
		case models.ErrUserNotFound:
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "User not found",
				Message:   "User account was not found",
				Timestamp: time.Now(),
			})
		default:
			logger.Error("Failed to update user handle",
				zap.String("user_id", user.ID.String()),
				zap.String("handle", handle),
				zap.Error(err),
			)
			return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
				Error:     "Internal server error",
				Message:   "Failed to update handle",
				Timestamp: time.Now(),
			})
		}
	}

	updatedUser, err := h.store.GetUserByHandle(c.Context(), handle)
	if err != nil {
		logger.Error("Failed to load updated user handle",
			zap.String("user_id", user.ID.String()),
			zap.String("handle", handle),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Handle updated but failed to load user profile",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(fiber.Map{
		"user": authUserResponse(updatedUser, true),
	})
}

// Login handles user authentication
// @Summary User login
// @Description Authenticate user with email and password
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.LoginRequest true "Login credentials"
// @Success 200 {object} models.LoginResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/auth/login [post]
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	identifier := strings.TrimSpace(req.Identifier)
	if identifier == "" {
		identifier = strings.TrimSpace(req.Email)
	}
	if identifier == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   "identifier is required",
			Timestamp: time.Now(),
		})
	}
	if !strings.Contains(identifier, "@") {
		identifier = strings.ToLower(identifier)
	}

	// Get user by email or handle
	user, err := h.store.GetUserByEmailOrHandle(c.Context(), identifier)
	if err != nil {
		logger.Warn("Login attempt with non-existent email",
			zap.String("identifier", identifier),
		)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Invalid credentials",
			Message:   "Email or password is incorrect",
			Timestamp: time.Now(),
		})
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		logger.Warn("Login attempt with incorrect password",
			zap.String("identifier", identifier),
			zap.String("user_id", user.ID.String()),
		)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Invalid credentials",
			Message:   "Email or password is incorrect",
			Timestamp: time.Now(),
		})
	}

	// Check if user is active
	if !user.Active {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{
			Error:     "Account disabled",
			Message:   "Your account has been disabled",
			Timestamp: time.Now(),
		})
	}

	// Update last login time
	now := time.Now()
	user.LastLoginAt = &now
	if err := h.store.UpdateUserLastLogin(c.Context(), user.ID); err != nil {
		logger.Error("Failed to update last login", zap.Error(err))
		// Don't fail the login if this fails
	}

	logger.Info("User logged in successfully",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
		zap.String("identifier", identifier),
	)

	// Generate JWT tokens
	accessToken, err := generateJWT(user.ID, 15*time.Minute, h.jwtSecret)
	if err != nil {
		logger.Error("Failed to generate access token", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to generate authentication token",
			Timestamp: time.Now(),
		})
	}

	refreshToken, err := generateJWT(user.ID, 7*24*time.Hour, h.jwtSecret)
	if err != nil {
		logger.Error("Failed to generate refresh token", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to generate authentication token",
			Timestamp: time.Now(),
		})
	}

	// Store refresh token in DB for rotation
	familyID := uuid.New()
	tokenHash := hashToken(refreshToken)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	rt := &models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		FamilyID:  familyID,
		IsRevoked: false,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
		Used:      false,
	}

	if err := h.store.StoreRefreshToken(c.Context(), rt); err != nil {
		logger.Error("Failed to store refresh token", zap.Error(err))
		// Continue anyway, but rotation won't work for this session
	}

	// Set JWT tokens as httpOnly cookies
	setAuthCookies(c, accessToken, refreshToken)

	// Return selective user fields and api_key separately.
	return c.JSON(fiber.Map{
		"user": fiber.Map{
			"id":             user.ID,
			"email":          user.Email,
			"handle":         user.Handle,
			"preset":         user.Preset,
			"active":         user.Active,
			"email_verified": user.EmailVerified,
			"last_login_at":  user.LastLoginAt,
			"created_at":     user.CreatedAt,
			"updated_at":     user.UpdatedAt,
			// api_key excluded from user object
		},
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"expires_in":    900, // 15 minutes in seconds
		"api_key":       user.APIKey,
	})
}

// RequestPasswordReset initiates password reset flow
// @Summary Request password reset
// @Description Send password reset email to user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.PasswordResetRequestPayload true "Email address"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/auth/request-reset [post]
func (h *AuthHandler) RequestPasswordReset(c *fiber.Ctx) error {
	var req models.PasswordResetRequestPayload
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Get user by email
	user, err := h.store.GetUserByEmail(c.Context(), req.Email)
	if err != nil {
		// Don't reveal if email exists or not for security
		logger.Info("Password reset requested for non-existent email",
			zap.String("email", req.Email),
		)
		return c.JSON(fiber.Map{
			"message": "If an account exists with this email, a password reset link has been sent",
		})
	}

	// Generate reset token
	resetToken := generateToken()
	expiresAt := time.Now().Add(1 * time.Hour) // Token valid for 1 hour

	// Update user with reset token
	user.ResetToken = &resetToken
	user.ResetTokenExpires = &expiresAt

	if err := h.store.SetPasswordResetToken(c.Context(), user.ID, resetToken, expiresAt); err != nil {
		logger.Error("Failed to set reset token",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to process password reset request",
			Timestamp: time.Now(),
		})
	}

	logger.Info("Password reset requested",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
	)

	// In production, send email with reset link here
	// TODO: Send email with link: https://rateguard.com/reset-password?token={resetToken}

	return c.JSON(fiber.Map{
		"message":   "If an account exists with this email, a password reset link has been sent",
		"dev_token": resetToken, // Remove in production!
	})
}

// ResetPassword completes password reset with token
// @Summary Reset password
// @Description Reset user password with reset token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.PasswordResetPayload true "Reset token and new password"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/auth/reset-password [post]
func (h *AuthHandler) ResetPassword(c *fiber.Ctx) error {
	var req models.PasswordResetPayload
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Get user by reset token
	user, err := h.store.GetUserByResetToken(c.Context(), req.Token)
	if err != nil {
		logger.Warn("Invalid reset token used", zap.String("token", req.Token[:8]+"..."))
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Invalid token",
			Message:   "Password reset token is invalid or has expired",
			Timestamp: time.Now(),
		})
	}

	// Check if token is expired
	if user.ResetTokenExpires != nil && time.Now().After(*user.ResetTokenExpires) {
		logger.Warn("Expired reset token used",
			zap.String("user_id", user.ID.String()),
		)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Token expired",
			Message:   "Password reset token has expired. Please request a new one",
			Timestamp: time.Now(),
		})
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		logger.Error("Failed to hash new password", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to process new password",
			Timestamp: time.Now(),
		})
	}

	// Update password and clear reset token
	if err := h.store.ResetPassword(c.Context(), user.ID, string(hashedPassword)); err != nil {
		logger.Error("Failed to reset password",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to reset password",
			Timestamp: time.Now(),
		})
	}

	logger.Info("Password reset successfully",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
	)

	return c.JSON(fiber.Map{
		"message": "Password has been reset successfully",
	})
}

// generateAPIKey generates a secure random API key
// Format: "rg_" + 30 hex chars = 33 total chars (fits in VARCHAR(64))
func generateAPIKey() string {
	b := make([]byte, 30) // 30 bytes = 60 hex chars, + "rg_" = 63 chars total
	rand.Read(b)
	return "rg_" + hex.EncodeToString(b)
}

// generateToken generates a secure random token for verification/reset
func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// detectAndUpdateGeoData detects and updates user geo data in background
// Non-blocking operation - errors are logged but don't fail signup
func (h *AuthHandler) detectAndUpdateGeoData(userID uuid.UUID, xForwardedFor, xRealIP, remoteAddr, cfCountry string) {
	// Extract IP from request headers
	ip := auth.ExtractIPFromRequest(xForwardedFor, xRealIP, remoteAddr)
	if ip == "" {
		logger.Debug("No valid IP found for geo detection", zap.String("user_id", userID.String()))
		return
	}

	// Detect geo data
	ctx := context.Background()
	geoData := h.geoDetector.DetectCurrencyFromIP(ctx, ip, cfCountry)

	// Update user record with geo data
	if err := h.store.UpdateUserGeoData(ctx, userID, geoData.CountryCode, geoData.Currency); err != nil {
		logger.Warn("Failed to update user geo data",
			zap.String("user_id", userID.String()),
			zap.String("ip", ip),
			zap.Error(err),
		)
		return
	}

	logger.Info("User geo data updated successfully",
		zap.String("user_id", userID.String()),
		zap.String("ip", ip),
		zap.String("country", geoData.CountryCode),
		zap.String("currency", geoData.Currency),
		zap.String("provider", geoData.Provider),
	)
}

// generateJWT generates a JWT token with the given user ID and expiry duration
func generateJWT(userID uuid.UUID, expiry time.Duration, jwtSecret string) (string, error) {
	// Get JWT secret from config
	secret := jwtSecret
	if secret == "" {
		// This should never happen if config is properly validated
		return "", fmt.Errorf("JWT secret not configured")
	}

	// Create JWT claims
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"exp":     time.Now().Add(expiry).Unix(),
		"iat":     time.Now().Unix(),
	}

	// Create token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign token with secret
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// VerifyEmail handles email verification with expiration check
// @Summary Verify email address
// @Description Verify user email using token
// @Tags auth
// @Param token query string true "Verification token"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Router /api/v1/auth/verify [get]
func (h *AuthHandler) VerifyEmail(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request",
			Message:   "Verification token is required",
			Timestamp: time.Now(),
		})
	}

	// Get user by token
	user, err := h.store.GetUserByVerificationToken(c.Context(), token)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid token",
			Message:   "Invalid or expired verification token",
			Timestamp: time.Now(),
		})
	}

	// Check expiration
	if user.VerificationTokenExpires != nil && time.Now().After(*user.VerificationTokenExpires) {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Token expired",
			Message:   "Verification token has expired. Please request a new one.",
			Timestamp: time.Now(),
		})
	}

	// Verify email
	if err := h.store.VerifyEmail(c.Context(), user.ID); err != nil {
		logger.Error("Failed to verify email", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to verify email",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Email verified successfully",
	})
}

// ResendVerificationEmail resends the verification email
// @Summary Resend verification email
// @Description Resend verification email to user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.PasswordResetRequestPayload true "Email address"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Router /api/v1/auth/resend-verification [post]
func (h *AuthHandler) ResendVerificationEmail(c *fiber.Ctx) error {
	var req models.PasswordResetRequestPayload // Reuse payload as it just has Email
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	user, err := h.store.GetUserByEmail(c.Context(), req.Email)
	if err != nil {
		// Don't reveal if user exists
		return c.JSON(fiber.Map{
			"message": "If an account exists, a verification email has been sent",
		})
	}

	if user.EmailVerified {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Already verified",
			Message:   "Email is already verified",
			Timestamp: time.Now(),
		})
	}

	// Generate new token and expiration
	newToken := generateToken()
	expiresAt := time.Now().Add(48 * time.Hour)

	if err := h.store.UpdateVerificationToken(c.Context(), user.ID, newToken, expiresAt); err != nil {
		logger.Error("Failed to update verification token", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to generate verification token",
			Timestamp: time.Now(),
		})
	}

	// In production, send email here
	// TODO: Send email with link: https://rateguard.com/verify?token={newToken}

	return c.JSON(fiber.Map{
		"message":   "If an account exists, a verification email has been sent",
		"dev_token": newToken, // Remove in production!
	})
}

// hashToken creates a SHA256 hash of the token string
func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// setAuthCookies sets JWT tokens as httpOnly cookies
func setAuthCookies(c *fiber.Ctx, accessToken, refreshToken string) {
	// Determine if we're in production (use Secure flag)
	isProduction := os.Getenv("ENVIRONMENT") == "production"

	if isProduction {
		// In production (Vercel -> Render), we need SameSite=None AND Partitioned (CHIPS)
		// Fiber v2 doesn't support Partitioned attribute natively, so we construct headers manually.

		// Access Token Cookie
		// Format: access_token=value; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=None; Partitioned
		accessCookie := fmt.Sprintf("access_token=%s; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=None; Partitioned", accessToken)
		c.Append("Set-Cookie", accessCookie)

		// Refresh Token Cookie
		// Format: refresh_token=value; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=None; Partitioned
		refreshCookie := fmt.Sprintf("refresh_token=%s; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=None; Partitioned", refreshToken)
		c.Append("Set-Cookie", refreshCookie)

		return
	}

	// In development (localhost -> localhost), we use standard Fiber cookie helper with SameSite=Lax
	c.Cookie(&fiber.Cookie{
		Name:     "access_token",
		Value:    accessToken,
		HTTPOnly: true,
		Secure:   false,
		SameSite: "Lax",
		MaxAge:   900, // 15 minutes
		Path:     "/",
	})

	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		HTTPOnly: true,
		Secure:   false,
		SameSite: "Lax",
		MaxAge:   7 * 24 * 60 * 60, // 7 days
		Path:     "/",
	})
}

// RefreshToken handles JWT token refresh
// @Summary Refresh access token
// @Description Refresh JWT access token using refresh token
// @Tags auth
// @Produce json
// @Success 200 {object} fiber.Map
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *fiber.Ctx) error {
	// Get refresh token from cookie
	refreshToken := c.Cookies("refresh_token")
	if refreshToken == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "No refresh token provided",
			Timestamp: time.Now(),
		})
	}

	// Get JWT secret
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "rateguard_dev_secret_change_me_in_production"
	}

	// Parse and verify refresh token
	token, err := jwt.Parse(refreshToken, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil || !token.Valid {
		logger.Warn("Invalid refresh token", zap.Error(err))
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Invalid or expired refresh token",
			Timestamp: time.Now(),
		})
	}

	// Extract user ID from claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Invalid token claims",
			Timestamp: time.Now(),
		})
	}

	userIDStr, ok := claims["user_id"].(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Invalid user ID in token",
			Timestamp: time.Now(),
		})
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Invalid user ID format",
			Timestamp: time.Now(),
		})
	}

	// Verify user exists and is active
	user, err := h.store.GetUserByID(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not found",
			Timestamp: time.Now(),
		})
	}

	if !user.Active {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{
			Error:     "Forbidden",
			Message:   "Account is inactive",
			Timestamp: time.Now(),
		})
	}

	// Verify refresh token in database (rotation enforcement)
	tokenHash := hashToken(refreshToken)
	storedToken, err := h.store.GetRefreshToken(c.Context(), tokenHash)

	if err != nil {
		logger.Warn("Refresh token not found in DB", zap.String("user_id", userID.String()))
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Invalid or expired refresh token",
			Timestamp: time.Now(),
		})
	}

	// 1. Check if revoked
	if storedToken.IsRevoked {
		logger.Warn("Attempt to use revoked refresh token",
			zap.String("user_id", userID.String()),
			zap.String("family_id", storedToken.FamilyID.String()),
		)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Session revoked",
			Timestamp: time.Now(),
		})
	}

	// 2. Check for reuse (theft detection)
	if storedToken.Used {
		logger.Error("Refresh token reuse detected! Revoking family.",
			zap.String("user_id", userID.String()),
			zap.String("family_id", storedToken.FamilyID.String()),
		)
		// Revoke the entire family
		if err := h.store.RevokeRefreshTokenFamily(c.Context(), storedToken.FamilyID); err != nil {
			logger.Error("Failed to revoke token family", zap.Error(err))
		}

		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Security alert: Token reuse detected",
			Timestamp: time.Now(),
		})
	}

	// 3. Mark current token as used
	if err := h.store.MarkRefreshTokenUsed(c.Context(), storedToken.ID); err != nil {
		logger.Error("Failed to mark token as used", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to process token",
			Timestamp: time.Now(),
		})
	}

	// Generate NEW tokens
	newAccessToken, err := generateJWT(user.ID, 15*time.Minute, h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to generate access token",
			Timestamp: time.Now(),
		})
	}

	newRefreshToken, err := generateJWT(user.ID, 7*24*time.Hour, h.jwtSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to generate refresh token",
			Timestamp: time.Now(),
		})
	}

	// Store NEW refresh token with SAME family ID.
	newTokenHash := hashToken(newRefreshToken)
	newRT := &models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: newTokenHash,
		FamilyID:  storedToken.FamilyID,
		IsRevoked: false,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
		Used:      false,
	}

	if err := h.store.StoreRefreshToken(c.Context(), newRT); err != nil {
		logger.Error("Failed to store new refresh token", zap.Error(err))
	}

	// Set cookies
	setAuthCookies(c, newAccessToken, newRefreshToken)

	logger.Info("Token refreshed successfully",
		zap.String("user_id", userID.String()),
	)

	return c.JSON(fiber.Map{
		"success":      true,
		"access_token": newAccessToken,
		"expires_in":   900,
	})
}

// Logout clears authentication cookies
// @Summary Logout user
// @Description Clear authentication cookies
// @Tags auth
// @Produce json
// @Success 200 {object} fiber.Map
// @Router /api/v1/auth/logout [post]
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// Clear cookies by setting MaxAge to -1
	c.Cookie(&fiber.Cookie{
		Name:     "access_token",
		Value:    "",
		HTTPOnly: true,
		MaxAge:   -1,
		Path:     "/",
	})

	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    "",
		HTTPOnly: true,
		MaxAge:   -1,
		Path:     "/",
	})

	logger.Info("User logged out")

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Logged out successfully",
	})
}

// GetCurrentUser returns the authenticated user's data
// @Summary Get current user
// @Description Get authenticated user's information from JWT token
// @Tags auth
// @Produce json
// @Success 200 {object} models.User
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/auth/me [get]
func (h *AuthHandler) GetCurrentUser(c *fiber.Ctx) error {
	// Get user from context (set by auth middleware)
	userVal := c.Locals("user")
	if userVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	user, ok := userVal.(*models.User)
	if !ok {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal Server Error",
			Message:   "Failed to get user data",
			Timestamp: time.Now(),
		})
	}

	logger.Debug("Current user retrieved",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
	)

	// ✅ SECURITY FIX: Return selective fields only, exclude api_key
	// API keys should NEVER be exposed in /me responses
	return c.JSON(fiber.Map{
		"user": authUserResponse(user, true),
	})
}

// DetectGeo returns the user's detected country and currency based on IP
// @Summary Detect user geo location
// @Description Detect country and currency from IP address
// @Tags auth
// @Produce json
// @Success 200 {object} auth.GeoData
// @Router /api/v1/auth/geo [get]
func (h *AuthHandler) DetectGeo(c *fiber.Ctx) error {
	// Extract IP from request headers
	xForwardedFor := c.Get("X-Forwarded-For")
	xRealIP := c.Get("X-Real-IP")
	remoteAddr := c.IP()
	cfCountry := c.Get("CF-IPCountry")

	ip := auth.ExtractIPFromRequest(xForwardedFor, xRealIP, remoteAddr)

	// Detect geo data
	ctx := c.Context()
	geoData := h.geoDetector.DetectCurrencyFromIP(ctx, ip, cfCountry)

	return c.JSON(geoData)
}
