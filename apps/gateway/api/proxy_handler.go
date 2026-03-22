package api

import (
	"encoding/json"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	domaingateway "github.com/varbees/rateguard/internal/domain/gateway"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// ProxyHandler handles API proxy requests
type ProxyHandler struct {
	proxyService *proxy.ProxyService
	store        *storage.PostgresStore
	client       *resty.Client
}

// NewProxyHandler creates a new proxy handler
func NewProxyHandler(proxyService *proxy.ProxyService, store *storage.PostgresStore) *ProxyHandler {
	return &ProxyHandler{
		proxyService: proxyService,
		store:        store,
		client:       resty.New().SetTimeout(30 * time.Second),
	}
}

// HandleProxyRequest proxies an API request with rate limiting
// @Summary Proxy an API request
// @Description Proxy a request to a configured API with rate limiting and tracking
// @Tags proxy
// @Accept json
// @Produce json
// @Param request body models.ProxyRequestPayload true "Proxy request payload"
// @Success 200 {object} models.ProxyResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 429 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/proxy [post]: Extend models (user, api_config, usage, proxy types)

func (h *ProxyHandler) HandleProxyRequest(c *fiber.Ctx) error {
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

	// Parse request payload
	var payload models.ProxyRequestPayload
	if err := c.BodyParser(&payload); err != nil {
		logger.Error("Failed to parse proxy request",
			zap.String("request_id", requestID),
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			RequestID: requestID,
			Timestamp: time.Now(),
		})
	}

	// Validate payload
	if payload.APIName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request",
			Message:   "API name is required",
			RequestID: requestID,
			Timestamp: time.Now(),
		})
	}

	// Serialize body to JSON if provided
	var bodyBytes []byte
	if payload.Body != nil {
		bodyBytes, err = json.Marshal(payload.Body)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Error:     "Invalid request body",
				Message:   "Failed to serialize body",
				RequestID: requestID,
				Timestamp: time.Now(),
			})
		}
	}

	// Store target API in context for tracking
	middleware.SetTargetAPIInContext(c, payload.APIName)

	// Build proxy request
	proxyReq := &models.ProxyRequest{
		ID:          domaingateway.CreateProxyRequestID(),
		UserID:      user.ID,
		TargetAPI:   payload.APIName,
		Method:      payload.Method,
		Headers:     payload.Headers,
		Body:        bodyBytes,
		QueryParams: payload.QueryParams,
		Timestamp:   time.Now(),
	}

	logger.Info("Processing proxy request",
		zap.String("request_id", requestID),
		zap.String("user_id", user.ID.String()),
		zap.String("api_name", payload.APIName),
		zap.String("method", payload.Method),
	)

	// Execute proxy request
	response, err := h.proxyService.ProxyRequest(c.Context(), proxyReq)
	if err != nil {
		if respErr := writeProxyRequestErrorResponse(
			c,
			err,
			response,
			requestID,
			user.ID.String(),
			payload.APIName,
			"Proxy request failed",
			"The specified API configuration does not exist",
			"The specified API is currently disabled",
		); respErr != nil {
			return respErr
		}
	}

	return writeProxySuccessResponse(c, response, payload.APIName, false, false, true, nil)
}

// GetProxyStats returns proxy service statistics
// @Summary Get proxy statistics
// @Description Returns statistics about the proxy service
// @Tags proxy
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/proxy/stats [get]
func (h *ProxyHandler) GetProxyStats(c *fiber.Ctx) error {
	stats := h.proxyService.GetStats()

	return c.JSON(fiber.Map{
		"stats":     stats,
		"timestamp": time.Now(),
	})
}

// GetCircuitBreakerStats returns circuit breaker statistics
// @Summary Get circuit breaker statistics
// @Description Returns aggregated statistics for all circuit breakers
// @Tags proxy
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/proxy/circuit-breakers/stats [get]
func (h *ProxyHandler) GetCircuitBreakerStats(c *fiber.Ctx) error {
	stats := h.proxyService.GetCircuitBreakerStats()

	return c.JSON(fiber.Map{
		"circuit_breaker_stats": stats,
		"timestamp":             time.Now(),
	})
}

// GetCircuitBreakerMetrics returns detailed circuit breaker metrics
// @Summary Get circuit breaker metrics
// @Description Returns detailed metrics for all circuit breakers (per-API)
// @Tags proxy
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/proxy/circuit-breakers/metrics [get]
func (h *ProxyHandler) GetCircuitBreakerMetrics(c *fiber.Ctx) error {
	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	metrics := h.proxyService.GetCircuitBreakerMetrics()

	logger.Info("Circuit breaker metrics requested",
		zap.String("user_id", user.ID.String()),
		zap.Int("total_breakers", len(metrics)),
	)

	return c.JSON(fiber.Map{
		"metrics":   metrics,
		"count":     len(metrics),
		"timestamp": time.Now(),
	})
}

// ResetCircuitBreaker resets a specific circuit breaker
// @Summary Reset a circuit breaker
// @Description Manually reset a circuit breaker for a specific API
// @Tags proxy
// @Param api_id path string true "API ID"
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/proxy/circuit-breakers/:api_id/reset [post]
func (h *ProxyHandler) ResetCircuitBreaker(c *fiber.Ctx) error {
	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	apiID := c.Params("api_id")
	if apiID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request",
			Message:   "API ID is required",
			Timestamp: time.Now(),
		})
	}

	err = h.proxyService.ResetCircuitBreaker(apiID)
	if err != nil {
		logger.Error("Failed to reset circuit breaker",
			zap.String("user_id", user.ID.String()),
			zap.String("api_id", apiID),
			zap.Error(err),
		)
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "Circuit breaker not found",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	logger.Info("Circuit breaker reset",
		zap.String("user_id", user.ID.String()),
		zap.String("api_id", apiID),
	)

	return c.JSON(fiber.Map{
		"message":   "Circuit breaker reset successfully",
		"api_id":    apiID,
		"timestamp": time.Now(),
	})
}
