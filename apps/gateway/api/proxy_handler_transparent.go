package api

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// HandleTransparentProxy handles transparent proxy requests
// This allows users to call /proxy/:api_name/* and have it forwarded to the configured API
// Example: POST /proxy/stripe_prod/v1/customers → https://api.stripe.com/v1/customers
func (h *ProxyHandler) HandleTransparentProxy(c *fiber.Ctx) error {
	requestID := uuid.New().String()
	c.Locals("request_id", requestID)

	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			RequestID: requestID,
			Timestamp: time.Now(),
		})
	}

	// Extract API name from path parameter
	apiName := c.Params("api_name")
	if apiName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request",
			Message:   "API name is required in path",
			RequestID: requestID,
			Timestamp: time.Now(),
		})
	}

	// Store target API in context for tracking
	middleware.SetTargetAPIInContext(c, apiName)

	// Build proxy request.
	proxyReq, apiPath := buildTransparentProxyRequest(c, user.ID, apiName)

	logger.Info("Transparent proxy request",
		zap.String("request_id", requestID),
		zap.String("user_id", user.ID.String()),
		zap.String("api_name", apiName),
		zap.String("method", c.Method()),
		zap.String("path", apiPath),
	)

	// Execute proxy request with intelligent queueing
	response, err := h.proxyService.ProxyRequestWithQueue(c.Context(), proxyReq)
	if err != nil {
		if respErr := writeProxyRequestErrorResponse(
			c,
			err,
			response,
			requestID,
			user.ID.String(),
			apiName,
			"Transparent proxy request failed",
			proxyNotFoundMessage("API configuration", apiName),
			proxyDisabledMessage("API", apiName),
		); respErr != nil {
			return respErr
		}
	}

	// Check if response is streaming
	if response.IsStreaming {
		logger.Info("Streaming response detected",
			zap.String("request_id", requestID),
			zap.String("user_id", user.ID.String()),
			zap.String("api_name", apiName),
			zap.String("stream_type", response.StreamingType),
		)
		return streamTransparentProxyResponse(c, response, requestID, user.ID, apiName, h.proxyService, h.proxyService)
	}

	return writeProxySuccessResponse(c, response, apiName, true, true, true, map[string]string{
		"X-RateGuard-Streaming":   "true",
		"X-RateGuard-Stream-Type": response.StreamingType,
	})
}

// isHopByHopHeader checks if a header is hop-by-hop and should not be forwarded
// Hop-by-hop headers are meant for a single transport-level connection
func isHopByHopHeader(header string) bool {
	hopByHopHeaders := map[string]bool{
		"connection":          true,
		"keep-alive":          true,
		"proxy-authenticate":  true,
		"proxy-authorization": true,
		"te":                  true,
		"trailer":             true,
		"transfer-encoding":   true,
		"upgrade":             true,
	}

	return hopByHopHeaders[strings.ToLower(header)]
}
