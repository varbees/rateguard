package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

type APIKeysHandler struct {
	store *storage.PostgresStore
}

func NewAPIKeysHandler(store *storage.PostgresStore) *APIKeysHandler {
	return &APIKeysHandler{store: store}
}

// ListAPIKeys lists all API keys for the authenticated user
// @Summary List API keys
// @Description Get all API keys (active and revoked) for the current user
// @Tags api-keys
// @Produce json
// @Success 200 {object} fiber.Map
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/api-keys [get]
func (h *APIKeysHandler) ListAPIKeys(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(401).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	keys, err := h.store.ListAPIKeys(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to list API keys",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(500).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to list API keys",
			Timestamp: time.Now(),
		})
	}

	// Convert to response format (masked keys)
	response := make([]models.APIKeyResponse, len(keys))
	for i, key := range keys {
		response[i] = key.ToResponse()
	}

	return c.JSON(fiber.Map{
		"api_keys": response,
		"count":    len(response),
	})
}

// CreateAPIKey creates a new API key
// @Summary Create API key
// @Description Generate a new API key with a custom name
// @Tags api-keys
// @Accept json
// @Produce json
// @Param request body CreateAPIKeyRequest true "API key details"
// @Success 201 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/api-keys [post]
func (h *APIKeysHandler) CreateAPIKey(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(401).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	var req struct {
		KeyName string `json:"key_name"`
	}

	if err := c.BodyParser(&req); err != nil || req.KeyName == "" {
		return c.Status(400).JSON(ErrorResponse{
			Error:     "Bad request",
			Message:   "key_name is required",
			Timestamp: time.Now(),
		})
	}

	// Generate secure API key (reuse function from auth_handler)
	apiKey := generateAPIKey()

	newKey := &models.APIKey{
		ID:        uuid.New(),
		UserID:    user.ID,
		KeyName:   req.KeyName,
		APIKey:    apiKey,
		CreatedAt: time.Now(),
	}

	if err := h.store.CreateAPIKey(c.Context(), newKey); err != nil {
		logger.Error("Failed to create API key",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(400).JSON(ErrorResponse{
			Error:     "Bad request",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	logger.Info("API key created",
		zap.String("user_id", user.ID.String()),
		zap.String("key_name", req.KeyName),
	)

	// ⚠️ Return full API key ONLY on creation (show once)
	return c.Status(201).JSON(fiber.Map{
		"id":         newKey.ID,
		"key_name":   newKey.KeyName,
		"api_key":    newKey.APIKey, // ✅ Full key shown ONCE
		"created_at": newKey.CreatedAt,
		"message":    "API key created successfully. Save it now - you won't be able to see it again.",
	})
}

// RevokeAPIKey revokes an API key (soft delete)
// @Summary Revoke API key
// @Description Revoke an API key - it will stop working immediately
// @Tags api-keys
// @Param id path string true "API Key ID"
// @Produce json
// @Success 200 {object} fiber.Map
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/api-keys/{id} [delete]
func (h *APIKeysHandler) RevokeAPIKey(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(401).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "User not authenticated",
			Timestamp: time.Now(),
		})
	}

	keyID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(ErrorResponse{
			Error:     "Bad request",
			Message:   "Invalid key ID",
			Timestamp: time.Now(),
		})
	}

	if err := h.store.RevokeAPIKey(c.Context(), keyID, user.ID); err != nil {
		logger.Error("Failed to revoke API key",
			zap.String("user_id", user.ID.String()),
			zap.String("key_id", keyID.String()),
			zap.Error(err),
		)
		return c.Status(400).JSON(ErrorResponse{
			Error:     "Bad request",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	logger.Info("API key revoked",
		zap.String("user_id", user.ID.String()),
		zap.String("key_id", keyID.String()),
	)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "API key revoked successfully",
	})
}
