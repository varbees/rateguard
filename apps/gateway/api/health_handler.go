package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/internal/webhook"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// HealthHandler handles health check and readiness probe endpoints
type HealthHandler struct {
	dbStore        *storage.PostgresStore
	redisClient    *cache.RedisClient
	proxyService   *proxy.ProxyService
	webhookWorker  *webhook.WebhookWorker
}

// NewHealthHandler creates a new health check handler
func NewHealthHandler(dbStore *storage.PostgresStore, redisClient *cache.RedisClient, proxyService *proxy.ProxyService, webhookWorker *webhook.WebhookWorker) *HealthHandler {
	return &HealthHandler{
		dbStore:       dbStore,
		redisClient:   redisClient,
		proxyService:  proxyService,
		webhookWorker: webhookWorker,
	}
}

// Health handles the liveness probe endpoint
// This endpoint should always return 200 OK if the service is running
// Kubernetes uses this to determine if the pod should be restarted
//
// @Summary Liveness probe
// @Description Returns 200 if the service is alive (simple check)
// @Tags health
// @Produce json
// @Success 200 {object} HealthResponse
// @Router /health [get]
func (h *HealthHandler) Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":    "ok",
		"timestamp": time.Now(),
		"service":   "RateGuard API Rate Limit Manager",
		"version":   "2.0.0",
	})
}

// Ready handles the readiness probe endpoint
// This endpoint checks if the service is ready to accept traffic
// Kubernetes uses this to determine if the pod should receive requests
//
// @Summary Readiness probe
// @Description Returns 200 if all dependencies are healthy, 503 otherwise
// @Tags health
// @Produce json
// @Success 200 {object} ReadinessResponse
// @Failure 503 {object} ReadinessResponse
// @Router /ready [get]
func (h *HealthHandler) Ready(c *fiber.Ctx) error {
	checks := make(map[string]bool)
	allHealthy := true

	// Check database connectivity
	dbHealthy := h.dbStore.Health()
	checks["database"] = dbHealthy
	if !dbHealthy {
		allHealthy = false
		logger.Warn("Readiness check: Database unhealthy")
	}

	// Check Redis (optional dependency)
	redisHealthy := true
	if h.redisClient != nil {
		redisHealthy = h.redisClient.Ping() == nil
		checks["redis"] = redisHealthy
		if !redisHealthy {
			allHealthy = false
			logger.Warn("Readiness check: Redis unhealthy")
		}
	} else {
		// Redis is optional - if not configured, mark as N/A
		checks["redis"] = true // Don't fail readiness if Redis is not configured
		logger.Debug("Readiness check: Redis not configured (using in-memory rate limiting)")
	}

	// Check Circuit Breakers (if any are open, we might want to report it, but maybe not fail readiness entirely?
	// Usually readiness fails if the service ITSELF cannot handle traffic.
	// If one upstream API is down (CB open), the service is still "ready" to handle other requests.
	// However, let's report it in the checks map for visibility.
	if h.proxyService != nil {
		stats := h.proxyService.GetCircuitBreakerStats()
		// We consider it "healthy" even if some CBs are open, as long as the mechanism itself is working.
		// But let's add a check that verifies we can access the CB manager.
		checks["circuit_breakers"] = true
		
		// Optional: Log if many CBs are open
		if stats.OpenCount > 0 {
			logger.Warn("Readiness check: Some circuit breakers are open",
				zap.Int("open_count", stats.OpenCount),
				zap.Int("total_count", stats.TotalCircuitBreakers),
			)
		}
	}

	// Check Webhook Worker (if enabled)
	if h.webhookWorker != nil {
		webhookHealthy := h.webhookWorker.Health()
		checks["webhook_worker"] = webhookHealthy
		if !webhookHealthy {
			allHealthy = false
			logger.Warn("Readiness check: Webhook worker unhealthy")
		}
	} else {
		// Webhook worker is optional - mark as N/A if not configured
		checks["webhook_worker"] = true
		logger.Debug("Readiness check: Webhook worker not configured")
	}

	// Determine status code and response
	statusCode := fiber.StatusOK
	status := "ready"
	
	if !allHealthy {
		statusCode = fiber.StatusServiceUnavailable
		status = "not ready"
		
		logger.Warn("Readiness check failed",
			zap.Bool("database", checks["database"]),
			zap.Bool("redis", checks["redis"]),
		)
	}

	return c.Status(statusCode).JSON(fiber.Map{
		"status":    status,
		"timestamp": time.Now(),
		"checks":    checks,
		"healthy":   allHealthy,
	})
}

// ReadinessResponse represents the readiness check response
type ReadinessResponse struct {
	Status    string           `json:"status"`
	Timestamp time.Time        `json:"timestamp"`
	Checks    map[string]bool  `json:"checks"`
	Healthy   bool             `json:"healthy"`
}
