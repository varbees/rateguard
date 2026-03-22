package api

import (
	"fmt"
	"strings"

	"github.com/go-resty/resty/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// HandleTemplateProxy handles /p/:provider/* requests for public marketplace templates
// Example: /p/openai/v1/chat/completions
func (h *ProxyHandler) HandleTemplateProxy(c *fiber.Ctx) error {
	requestID := uuid.New().String()
	c.Locals("request_id", requestID)

	provider := c.Params("provider")
	endpoint := c.Params("*")

	logger.Debug("Template proxy request",
		zap.String("request_id", requestID),
		zap.String("provider", provider),
		zap.String("endpoint", endpoint),
	)

	// 1. Authenticate user (REQUIRED - templates are not anonymous)
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Authentication required",
			"message": "Marketplace templates require authentication. Add X-API-Key or Authorization header",
			"hint":    "Get your API key from dashboard.rateguard.dev",
		})
	}

	// 2. Get template configuration from database
	template, err := h.store.GetAPITemplateByProvider(c.Context(), provider)
	if err != nil {
		logger.Warn("Template not found",
			zap.String("provider", provider),
			zap.String("user_id", user.ID.String()),
		)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":           "Template not found",
			"provider":        provider,
			"available_at":    "/api/v1/marketplace/templates",
			"need_custom_api": "Use /p/:username/:projectslug instead",
		})
	}

	// 3. User MUST provide their own provider API key
	// Extract from Authorization header (forwarded to target API)
	providerKey := c.Get("Authorization")
	if providerKey == "" {
		providerKey = c.Get("X-API-Key")
		if providerKey != "" {
			// Convert to Authorization: Bearer format
			providerKey = "Bearer " + providerKey
		}
	}

	if providerKey == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Provider API key required",
			"message": fmt.Sprintf("Add your %s API key in Authorization header", template.DisplayName),
			"example": "Authorization: Bearer YOUR_OPENAI_KEY",
			"docs":    fmt.Sprintf("https://rateguard.dev/docs/templates/%s", template.Provider),
		})
	}

	// 4. Build target URL from template + endpoint
	targetURL := strings.TrimSuffix(template.TargetURL, "/") + "/" + strings.TrimPrefix(endpoint, "/")

	logger.Info("Proxying to template",
		zap.String("request_id", requestID),
		zap.String("user_id", user.ID.String()),
		zap.String("provider", provider),
		zap.String("target", targetURL),
	)

	// 5. Forward request to target API with user's provider key
	// Use existing proxy logic but with template config
	response, err := h.forwardTemplateRequest(c, template, targetURL, providerKey, requestID)
	if err != nil {
		logger.Error("Template proxy failed",
			zap.String("request_id", requestID),
			zap.String("provider", provider),
			zap.Error(err),
		)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error":      "Proxy failed",
			"message":    err.Error(),
			"request_id": requestID,
		})
	}

	// 6. Track template usage (async, non-blocking)
	go func() {
		ctx := c.Context()
		if err := h.store.TrackTemplateUsage(ctx, user.ID, provider); err != nil {
			logger.Warn("Failed to track template usage",
				zap.String("user_id", user.ID.String()),
				zap.String("provider", provider),
				zap.Error(err),
			)
		}
	}()

	// 7. Return response with tracking headers.
	return writeProxySuccessResponse(c, response, "", false, false, false, map[string]string{
		"X-RateGuard-Request-ID": requestID,
		"X-RateGuard-Template":   template.Provider,
		"X-RateGuard-Preset":     user.Preset,
	})
}

// forwardTemplateRequest forwards a request to a template's target API
func (h *ProxyHandler) forwardTemplateRequest(c *fiber.Ctx, template *models.APITemplate, targetURL, providerKey, requestID string) (*models.ProxyResponse, error) {
	return forwardProxyRequest(h.client, targetURL, c.Method(), requestID, func(req *resty.Request) {
		req.SetHeader("Authorization", providerKey)
		req.SetHeader("Content-Type", c.Get("Content-Type", "application/json"))
		req.SetBody(c.Body())

		c.Context().QueryArgs().VisitAll(func(key, value []byte) {
			req.SetQueryParam(string(key), string(value))
		})

		for key, value := range template.RequiredHeaders {
			req.SetHeader(key, value)
		}
	})
}
