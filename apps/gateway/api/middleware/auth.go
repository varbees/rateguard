package middleware

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// AuthMiddleware validates API keys and loads user context
type AuthMiddleware struct {
	store     *storage.PostgresStore
	jwtSecret string
}

// NewAuthMiddleware creates a new authentication middleware
func NewAuthMiddleware(store *storage.PostgresStore, jwtSecret string) *AuthMiddleware {
	return &AuthMiddleware{
		store:     store,
		jwtSecret: jwtSecret,
	}
}

// Authenticate validates JWT token or API key and loads user into context
// Priority: 1. JWT from cookie, 2. JWT from Bearer token, 3. API key
func (m *AuthMiddleware) Authenticate(c *fiber.Ctx) error {
	// Try JWT authentication first (from cookie)
	accessToken := c.Cookies("access_token")
	if accessToken != "" {
		_, err := m.authenticateWithJWT(c, accessToken)
		if err == nil {
			return c.Next()
		}
		// If JWT is invalid/expired, try to auto-refresh if we have a refresh token
		if err == errTokenExpired {
			logger.Debug("Access token expired, attempting auto-refresh")
			// Don't fail yet, let the request continue and client will refresh
		}
	}

	// Try JWT from Authorization Bearer header
	authHeader := c.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		// Check if it's a JWT (contains dots) or API key (starts with rg_)
		if strings.Contains(token, ".") {
			_, err := m.authenticateWithJWT(c, token)
			if err == nil {
				return c.Next()
			}
		} else {
			// Treat as API key
			_, err := m.authenticateWithAPIKey(c, token)
			if err == nil {
				return c.Next()
			}
		}
	}

	apiKey := c.Get("X-API-Key")
	if apiKey != "" {
		_, err := m.authenticateWithAPIKey(c, apiKey)
		if err == nil {
			return c.Next()
		}
	}

	// No valid authentication found
	logger.Warn("No valid authentication provided",
		zap.String("path", c.Path()),
		zap.String("ip", c.IP()),
	)
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"error":     "Unauthorized",
		"message":   "Authentication required",
		"timestamp": time.Now(),
	})
}

var errTokenExpired = fmt.Errorf("token expired")

// authenticateWithJWT validates JWT token and loads user into context
func (m *AuthMiddleware) authenticateWithJWT(c *fiber.Ctx, tokenString string) (*models.User, error) {
	// Get JWT secret from config (REQUIRED for production)
	secret := m.jwtSecret
	if secret == "" {
		logger.Error("JWT secret not configured - authentication will fail",
			zap.String("path", c.Path()),
		)
		return nil, fmt.Errorf("JWT secret not configured")
	}

	// Parse and verify token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		if strings.Contains(err.Error(), "expired") {
			return nil, errTokenExpired
		}
		logger.Debug("Invalid JWT token", zap.Error(err))
		return nil, fmt.Errorf("invalid token")
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	// Extract user ID from claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	userIDStr, ok := claims["user_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid user ID in token")
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID format")
	}

	// Get user from database
	user, err := m.store.GetUserByID(c.Context(), userID)
	if err != nil {
		logger.Warn("User not found for JWT",
			zap.String("user_id", userID.String()),
		)
		return nil, fmt.Errorf("user not found")
	}

	// Check if user is active
	if !user.Active {
		logger.Warn("Inactive user attempted access via JWT",
			zap.String("user_id", user.ID.String()),
			zap.String("email", user.Email),
		)
		return nil, fmt.Errorf("account inactive")
	}

	// Store user in context
	c.Locals("user", user)
	c.Locals("user_id", user.ID)
	c.Locals("auth_method", "jwt")
	preset := domainpolicy.NormalizePreset(user.Preset)

	logger.Debug("User authenticated via JWT",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
		zap.String("preset", preset),
	)

	return user, nil
}

// authenticateWithAPIKey validates API key and loads user into context
func (m *AuthMiddleware) authenticateWithAPIKey(c *fiber.Ctx, apiKey string) (*models.User, error) {
	// Validate API key and get user
	user, err := m.store.GetUserByAPIKey(c.Context(), apiKey)
	if err != nil {
		if err == models.ErrUserNotFound {
			logger.Warn("Invalid API key",
				zap.String("api_key_prefix", apiKey[:min(8, len(apiKey))]+"..."),
				zap.String("path", c.Path()),
				zap.String("ip", c.IP()),
			)
			return nil, fmt.Errorf("invalid API key")
		}

		logger.Error("Failed to validate API key",
			zap.String("path", c.Path()),
			zap.Error(err),
		)
		return nil, fmt.Errorf("failed to validate credentials")
	}

	// Check if user is active
	if !user.Active {
		logger.Warn("Inactive user attempted access via API key",
			zap.String("user_id", user.ID.String()),
			zap.String("email", user.Email),
		)
		return nil, fmt.Errorf("account inactive")
	}

	// Store user in context
	c.Locals("user", user)
	c.Locals("user_id", user.ID)
	c.Locals("auth_method", "api_key")
	preset := domainpolicy.NormalizePreset(user.Preset)

	logger.Debug("User authenticated via API key",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
		zap.String("preset", preset),
	)

	return user, nil
}

// GetUserFromContext retrieves the user from fiber context
func GetUserFromContext(c *fiber.Ctx) (*models.User, error) {
	userVal := c.Locals("user")
	if userVal == nil {
		return nil, fmt.Errorf("user not found in context")
	}

	user, ok := userVal.(*models.User)
	if !ok {
		return nil, fmt.Errorf("invalid user type in context")
	}

	return user, nil
}

// SetTargetAPIInContext stores the target API name in context for tracking
func SetTargetAPIInContext(c *fiber.Ctx, targetAPI string) {
	c.Locals("target_api", targetAPI)
}

// GetTargetAPIFromContext retrieves the target API name from context
func GetTargetAPIFromContext(c *fiber.Ctx) string {
	targetAPI, ok := c.Locals("target_api").(string)
	if !ok {
		return ""
	}
	return targetAPI
}

// GetUserIDFromContext retrieves the authenticated user ID from context
func GetUserIDFromContext(c *fiber.Ctx) (uuid.UUID, error) {
	userID := c.Locals("user_id")
	if userID == nil {
		return uuid.Nil, models.ErrUserNotFound
	}

	id, ok := userID.(uuid.UUID)
	if !ok {
		return uuid.Nil, models.ErrUserNotFound
	}

	return id, nil
}

// RequirePreset creates middleware that requires a specific preset or higher.
func (m *AuthMiddleware) RequirePreset(requiredPreset string) fiber.Handler {
	presetHierarchy := map[string]int{
		"dev":                        1,
		"standard":                   2,
		"high-throughput":            3,
		"llm-heavy":                  4,
		"strict-upstream-protection": 5,
	}

	return func(c *fiber.Ctx) error {
		user, err := GetUserFromContext(c)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error":     "Unauthorized",
				"message":   "Authentication required",
				"timestamp": time.Now(),
			})
		}

		userPreset := strings.TrimSpace(user.Preset)
		userLevel := presetHierarchy[domainpolicy.NormalizePreset(userPreset)]
		requiredLevel := presetHierarchy[domainpolicy.NormalizePreset(requiredPreset)]

		if userLevel < requiredLevel {
			logger.Warn("Insufficient preset level",
				zap.String("user_id", user.ID.String()),
				zap.String("user_preset", domainpolicy.NormalizePreset(user.Preset)),
				zap.String("required_preset", domainpolicy.NormalizePreset(requiredPreset)),
			)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":     "Forbidden",
				"message":   fmt.Sprintf("This feature requires %s preset or higher", requiredPreset),
				"timestamp": time.Now(),
			})
		}

		return c.Next()
	}
}

// Optional middleware that authenticates but doesn't require authentication
func (m *AuthMiddleware) Optional(c *fiber.Ctx) error {
	apiKey := c.Get("X-API-Key")
	if apiKey == "" {
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			apiKey = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if apiKey != "" {
		user, err := m.store.GetUserByAPIKey(c.Context(), apiKey)
		if err == nil && user.Active {
			c.Locals("user", user)
			c.Locals("user_id", user.ID)
		}
	}

	return c.Next()
}
