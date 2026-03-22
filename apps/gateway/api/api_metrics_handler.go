package api

import (
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// APIMetricsResponse represents real-time metrics for a specific API
type APIMetricsResponse struct {
	APIID          string             `json:"api_id"`
	APIName        string             `json:"api_name"`
	RequestsToday  int64              `json:"requests_today"`
	RequestsHour   int64              `json:"requests_hour"`
	SuccessRate    float64            `json:"success_rate"`
	AvgLatencyMs   float64            `json:"avg_latency_ms"`
	P95LatencyMs   float64            `json:"p95_latency_ms"`
	ErrorCount     int64              `json:"error_count"`
	LastRequestAt  *time.Time         `json:"last_request_at"`
	CircuitBreaker CircuitBreakerInfo `json:"circuit_breaker"`
	QueueStatus    QueueStatusInfo    `json:"queue_status"`
}

type CircuitBreakerInfo struct {
	State       string     `json:"state"`
	Failures    int        `json:"failures"`
	LastFailure *time.Time `json:"last_failure,omitempty"`
}

type QueueStatusInfo struct {
	Pending int `json:"pending"`
	Failed  int `json:"failed"`
}

// GetAPIMetrics returns comprehensive metrics for a specific API
// @Summary Get API-specific metrics
// @Description Returns real-time metrics for a specific API configuration
// @Tags dashboard
// @Produce json
// @Param id path string true "API ID"
// @Success 200 {object} APIMetricsResponse
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/apis/{id}/metrics [get]
func (h *DashboardHandler) GetAPIMetrics(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	apiID := c.Params("id")
	if apiID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Bad Request",
			Message:   "API ID is required",
			Timestamp: time.Now(),
		})
	}

	// Verify API belongs to user
	api, err := h.store.GetAPIConfig(c.Context(), uuid.MustParse(apiID), user.ID)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Not Found",
				Message:   "API configuration not found",
				Timestamp: time.Now(),
			})
		}
		logger.Error("Failed to get API config",
			zap.String("api_id", apiID),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal Server Error",
			Message:   "Failed to retrieve API configuration",
			Timestamp: time.Now(),
		})
	}

	// Get metrics from usage tracker
	metrics, err := h.usageTracker.GetAPIMetrics(c.Context(), user.ID, uuid.MustParse(apiID))
	if err != nil {
		logger.Error("Failed to get API metrics",
			zap.String("api_id", apiID),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal Server Error",
			Message:   "Failed to retrieve API metrics",
			Timestamp: time.Now(),
		})
	}

	// Get circuit breaker status
	cbInfo := CircuitBreakerInfo{
		State:    "closed",
		Failures: 0,
	}
	if h.proxyService != nil {
		cbData := h.proxyService.GetCircuitBreakerForAPI(apiID)
		if cbData != nil {
			cbInfo.State = cbData.State
			cbInfo.Failures = cbData.Failures
			if cbData.LastFailureAt != nil {
				cbInfo.LastFailure = cbData.LastFailureAt
			}
		}
	}

	// Get queue status (if available)
	queueInfo := QueueStatusInfo{}
	if h.proxyService != nil {
		queueStats := h.proxyService.GetQueueStats(user.ID)
		queueInfo.Failed = int(queueStats.DroppedJobs)
		for _, apiQueue := range queueStats.QueuedByAPI {
			if apiQueue.APIName == api.Name {
				queueInfo.Pending = apiQueue.QueuedRequests
				break
			}
		}
	}

	response := APIMetricsResponse{
		APIID:          apiID,
		APIName:        api.Name,
		RequestsToday:  metrics.RequestsToday,
		RequestsHour:   metrics.RequestsHour,
		SuccessRate:    metrics.SuccessRate,
		AvgLatencyMs:   metrics.AvgLatencyMs,
		P95LatencyMs:   metrics.P95LatencyMs,
		ErrorCount:     metrics.ErrorCount,
		LastRequestAt:  metrics.LastRequestAt,
		CircuitBreaker: cbInfo,
		QueueStatus:    queueInfo,
	}

	return c.JSON(response)
}
