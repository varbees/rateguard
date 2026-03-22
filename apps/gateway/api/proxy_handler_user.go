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

// HandleUserProxy handles /p/:username/:projectslug/* requests for user-specific API configs
// Example: /p/johndoe/my-project/v1/endpoint
func (h *ProxyHandler) HandleUserProxy(c *fiber.Ctx) error {
	requestID := uuid.New().String()
	c.Locals("request_id", requestID)

	username := c.Params("username")
	projectSlug := c.Params("projectslug")
	endpoint := c.Params("*")

	logger.Debug("User proxy request",
		zap.String("request_id", requestID),
		zap.String("username", username),
		zap.String("project_slug", projectSlug),
		zap.String("endpoint", endpoint),
	)

	// 1. Authenticate request (REQUIRED)
	authenticatedUser, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Authentication required",
			"message": "Add your RateGuard API key via X-API-Key or Authorization header",
			"hint":    "Get your API key from dashboard.rateguard.dev",
		})
	}

	// 2. Look up target user by handle
	targetUser, err := h.store.GetUserByHandle(c.Context(), username)
	if err != nil {
		logger.Warn("User handle not found",
			zap.String("handle", username),
			zap.String("authenticated_user", authenticatedUser.ID.String()),
		)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "User not found",
			"handle":  username,
			"message": "No user found with this handle",
		})
	}

	// 3. Check ownership (only owner can access their own projects)
	if authenticatedUser.ID != targetUser.ID {
		logger.Warn("Unauthorized access attempt",
			zap.String("authenticated_user", authenticatedUser.ID.String()),
			zap.String("target_user", targetUser.ID.String()),
			zap.String("handle", username),
		)
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":   "Forbidden",
			"message": "You can only access your own API projects",
			"hint":    fmt.Sprintf("This project belongs to @%s", username),
		})
	}

	// 4. Get API config by user ID + slug
	apiConfig, err := h.store.GetAPIConfigBySlug(c.Context(), targetUser.ID, projectSlug)
	if err != nil {
		logger.Warn("Project slug not found",
			zap.String("user_id", targetUser.ID.String()),
			zap.String("slug", projectSlug),
		)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Project not found",
			"slug":    projectSlug,
			"message": fmt.Sprintf("No project '%s' found for @%s", projectSlug, username),
			"hint":    "Check your dashboard for available projects",
		})
	}

	// 5. Check if API config is enabled
	if !apiConfig.Enabled {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":   "Project disabled",
			"message": "This API project is currently disabled",
			"hint":    "Enable it from your dashboard",
		})
	}

	// 6. Build target URL
	targetURL := strings.TrimSuffix(apiConfig.TargetURL, "/") + "/" + strings.TrimPrefix(endpoint, "/")

	logger.Info("Proxying to user API config",
		zap.String("request_id", requestID),
		zap.String("user_id", authenticatedUser.ID.String()),
		zap.String("project_slug", projectSlug),
		zap.String("target", targetURL),
	)

	// 7. Forward request using stored API config
	response, err := h.forwardUserRequest(c, apiConfig, targetURL, requestID)
	if err != nil {
		logger.Error("User proxy failed",
			zap.String("request_id", requestID),
			zap.String("project_slug", projectSlug),
			zap.Error(err),
		)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error":      "Proxy failed",
			"message":    err.Error(),
			"request_id": requestID,
		})
	}

	// 8. Return response with tracking headers.
	return writeProxySuccessResponse(c, response, "", false, false, false, map[string]string{
		"X-RateGuard-Request-ID": requestID,
		"X-RateGuard-User":       username,
		"X-RateGuard-Project":    projectSlug,
		"X-RateGuard-Preset":     authenticatedUser.Preset,
	})
}

// forwardUserRequest forwards a request to a user's configured API
func (h *ProxyHandler) forwardUserRequest(c *fiber.Ctx, apiConfig *models.APIConfig, targetURL, requestID string) (*models.ProxyResponse, error) {
	return forwardProxyRequest(h.client, targetURL, c.Method(), requestID, func(req *resty.Request) {
		req.SetHeader("Content-Type", c.Get("Content-Type", "application/json"))
		req.SetBody(c.Body())

		c.Context().QueryArgs().VisitAll(func(key, value []byte) {
			req.SetQueryParam(string(key), string(value))
		})

		for key, value := range apiConfig.CustomHeaders {
			req.SetHeader(key, value)
		}

		switch apiConfig.AuthType {
		case "bearer":
			if token, ok := apiConfig.AuthCredentials["token"]; ok {
				req.SetHeader("Authorization", "Bearer "+token)
			}
		case "api_key":
			if key, ok := apiConfig.AuthCredentials["key"]; ok {
				headerName := apiConfig.AuthCredentials["header_name"]
				if headerName == "" {
					headerName = "X-API-Key"
				}
				req.SetHeader(headerName, key)
			}
		case "basic":
			if username, ok := apiConfig.AuthCredentials["username"]; ok {
				if password, ok2 := apiConfig.AuthCredentials["password"]; ok2 {
					req.SetBasicAuth(username, password)
				}
			}
		}
	})
}
