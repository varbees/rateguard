package api

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// SettingsHandler handles user settings endpoints
type SettingsHandler struct {
	store *storage.PostgresStore
}

// NewSettingsHandler creates a new settings handler
func NewSettingsHandler(store *storage.PostgresStore) *SettingsHandler {
	return &SettingsHandler{
		store: store,
	}
}

// GetSettings returns user settings and profile information
// @Summary Get user settings
// @Description Get authenticated user's settings and profile
// @Tags settings
// @Produce json
// @Success 200 {object} fiber.Map
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/settings [get]
func (h *SettingsHandler) GetSettings(c *fiber.Ctx) error {
	// Get user from context (set by auth middleware)
	user, ok := c.Locals("user").(*models.User)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	// Get notification preferences (if exists)
	notificationPrefs, err := h.store.GetNotificationPreferences(c.Context(), user.ID)
	if err != nil {
		logger.Warn("Failed to get notification preferences",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		// Use defaults if not found
		notificationPrefs = &models.NotificationPreferences{
			UserID:                user.ID,
			EmailAlerts:           true,
			UsageThresholdPercent: 80,
			ErrorAlerts:           true,
			WeeklyReport:          false,
		}
	}

	logger.Debug("Settings retrieved",
		zap.String("user_id", user.ID.String()),
	)

	return c.JSON(fiber.Map{
		"user": fiber.Map{
			"id":                user.ID,
			"email":             user.Email,
			"name":              user.Email, // Use email as name for now
			"preset":            user.Preset,
			"email_verified":    user.EmailVerified,
			"country_code":      user.CountryCode,
			"detected_currency": user.DetectedCurrency,
			"created_at":        user.CreatedAt,
			"last_login_at":     user.LastLoginAt,
		},
		"notifications": fiber.Map{
			"email_alerts":            notificationPrefs.EmailAlerts,
			"usage_threshold_percent": notificationPrefs.UsageThresholdPercent,
			"error_alerts":            notificationPrefs.ErrorAlerts,
			"weekly_report":           notificationPrefs.WeeklyReport,
		},
	})
}

// UpdateSettingsRequest represents the settings update request
type UpdateSettingsRequest struct {
	// Notification preferences
	EmailAlerts           *bool `json:"email_alerts,omitempty"`
	UsageThresholdPercent *int  `json:"usage_threshold_percent,omitempty"`
	ErrorAlerts           *bool `json:"error_alerts,omitempty"`
	WeeklyReport          *bool `json:"weekly_report,omitempty"`
}

// UpdateSettings updates user settings
// @Summary Update user settings
// @Description Update user's notification preferences
// @Tags settings
// @Accept json
// @Produce json
// @Param request body UpdateSettingsRequest true "Settings to update"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/settings [put]
func (h *SettingsHandler) UpdateSettings(c *fiber.Ctx) error {
	// Get user from context
	user, ok := c.Locals("user").(*models.User)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	var req UpdateSettingsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Get current preferences or create new
	prefs, err := h.store.GetNotificationPreferences(c.Context(), user.ID)
	if err != nil {
		// Create new preferences with defaults
		prefs = &models.NotificationPreferences{
			UserID:                user.ID,
			EmailAlerts:           true,
			UsageThresholdPercent: 80,
			ErrorAlerts:           true,
			WeeklyReport:          false,
		}
	}

	// Update only provided fields
	if req.EmailAlerts != nil {
		prefs.EmailAlerts = *req.EmailAlerts
	}
	if req.UsageThresholdPercent != nil {
		prefs.UsageThresholdPercent = *req.UsageThresholdPercent
	}
	if req.ErrorAlerts != nil {
		prefs.ErrorAlerts = *req.ErrorAlerts
	}
	if req.WeeklyReport != nil {
		prefs.WeeklyReport = *req.WeeklyReport
	}

	// Save preferences
	if err := h.store.UpsertNotificationPreferences(c.Context(), prefs); err != nil {
		logger.Error("Failed to update notification preferences",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to update settings",
			Message:   "Could not save notification preferences",
			Timestamp: time.Now(),
		})
	}

	logger.Info("Settings updated successfully",
		zap.String("user_id", user.ID.String()),
	)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Settings updated successfully",
	})
}

// ChangePasswordRequest represents password change request
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

// ChangePassword handles password change with verification
// @Summary Change password
// @Description Change user password with current password verification
// @Tags settings
// @Accept json
// @Produce json
// @Param request body ChangePasswordRequest true "Password change details"
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/settings/password [post]
func (h *SettingsHandler) ChangePassword(c *fiber.Ctx) error {
	// Get user from context
	user, ok := c.Locals("user").(*models.User)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	var req ChangePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Validate input
	if req.CurrentPassword == "" || req.NewPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Validation failed",
			Message:   "Both current and new password are required",
			Timestamp: time.Now(),
		})
	}

	if len(req.NewPassword) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Validation failed",
			Message:   "New password must be at least 8 characters long",
			Timestamp: time.Now(),
		})
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		logger.Warn("Password change attempt with incorrect current password",
			zap.String("user_id", user.ID.String()),
		)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Invalid current password",
			Message:   "The current password you provided is incorrect",
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

	// Update password
	if err := h.store.UpdatePassword(c.Context(), user.ID, string(hashedPassword)); err != nil {
		logger.Error("Failed to update password",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to change password",
			Message:   "Could not update password",
			Timestamp: time.Now(),
		})
	}

	logger.Info("Password changed successfully",
		zap.String("user_id", user.ID.String()),
	)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Password changed successfully",
	})
}

// RegenerateAPIKey generates a new API key for the user
// @Summary Regenerate API key
// @Description Generate a new API key and invalidate the old one
// @Tags settings
// @Produce json
// @Success 200 {object} fiber.Map
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/api-key/regenerate [post]
func (h *SettingsHandler) RegenerateAPIKey(c *fiber.Ctx) error {
	// Get user from context
	user, ok := c.Locals("user").(*models.User)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	// Generate new API key using secure random
	newAPIKey := generateSecureAPIKey()

	// Update user's API key
	if err := h.store.UpdateAPIKey(c.Context(), user.ID, newAPIKey); err != nil {
		logger.Error("Failed to regenerate API key",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to regenerate API key",
			Message:   "Could not generate new API key",
			Timestamp: time.Now(),
		})
	}

	logger.Info("API key regenerated successfully",
		zap.String("user_id", user.ID.String()),
	)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "API key regenerated successfully",
		"api_key": newAPIKey,
	})
}

// generateSecureAPIKey generates a cryptographically secure API key
// Format: "rg_" + 48 hex characters (24 random bytes)
func generateSecureAPIKey() string {
	b := make([]byte, 24) // 24 bytes = 48 hex chars
	if _, err := rand.Read(b); err != nil {
		logger.Error("Failed to generate secure random bytes", zap.Error(err))
		// Fallback to timestamp-based generation (not recommended for production)
		return "rg_" + uuid.New().String()
	}
	return "rg_" + hex.EncodeToString(b)
}
