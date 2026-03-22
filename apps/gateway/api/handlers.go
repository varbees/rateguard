package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/aggregator"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// Handler holds dependencies for HTTP handlers
type Handler struct {
	aggregator *aggregator.Service
}

// NewHandler creates a new API handler
func NewHandler(agg *aggregator.Service) *Handler {
	return &Handler{
		aggregator: agg,
	}
}

// AggregateRequest represents the request body for aggregation
type AggregateRequest struct {
	Sources []SourceConfig `json:"sources" validate:"required,min=1"`
}

// SourceConfig represents a single API source configuration
type SourceConfig struct {
	Name    string            `json:"name" validate:"required"`
	URL     string            `json:"url" validate:"required,url"`
	Method  string            `json:"method" validate:"required"`
	Headers map[string]string `json:"headers"`
	Timeout int               `json:"timeout_sec"` // Optional per-source timeout
}

// AggregateHandler handles concurrent API aggregation requests
// @Summary Aggregate data from multiple APIs
// @Description Fetches data from multiple API endpoints concurrently
// @Tags aggregation
// @Accept json
// @Produce json
// @Param request body AggregateRequest true "API sources to aggregate"
// @Success 200 {object} models.AggregatedResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/aggregate [post]
func (h *Handler) AggregateHandler(c *fiber.Ctx) error {
	requestID := uuid.New().String()
	c.Locals("request_id", requestID)
	
	start := time.Now()
	
	logger.LogHTTPRequest(
		c.Method(),
		c.Path(),
		c.IP(),
		requestID,
	)

	// Parse request body
	var req AggregateRequest
	if err := c.BodyParser(&req); err != nil {
		logger.Error("Failed to parse request body",
			zap.String("request_id", requestID),
			zap.Error(err),
		)
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			RequestID: requestID,
			Timestamp: time.Now(),
		})
	}

	// Validate request
	if len(req.Sources) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "No sources provided",
			Message:   "At least one source is required",
			RequestID: requestID,
			Timestamp: time.Now(),
		})
	}

	// Convert to internal models
	sources := make([]models.APISource, len(req.Sources))
	for i, src := range req.Sources {
		timeout := 10 * time.Second // Default timeout
		if src.Timeout > 0 {
			timeout = time.Duration(src.Timeout) * time.Second
		}

		sources[i] = models.APISource{
			Name:    src.Name,
			URL:     src.URL,
			Method:  src.Method,
			Headers: src.Headers,
			Timeout: timeout,
		}
	}

	logger.Info("Processing aggregation request",
		zap.String("request_id", requestID),
		zap.Int("source_count", len(sources)),
	)

	// Perform aggregation
	result, err := h.aggregator.Aggregate(c.Context(), sources)
	if err != nil {
		logger.Error("Aggregation failed",
			zap.String("request_id", requestID),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Aggregation failed",
			Message:   err.Error(),
			RequestID: requestID,
			Timestamp: time.Now(),
		})
	}

	duration := time.Since(start)
	logger.LogHTTPResponse(
		c.Method(),
		c.Path(),
		fiber.StatusOK,
		duration,
		requestID,
	)

	return c.JSON(result)
}

// HealthHandler checks service health
// @Summary Health check
// @Description Returns the health status of the service
// @Tags health
// @Produce json
// @Success 200 {object} HealthResponse
// @Router /health [get]
func (h *Handler) HealthHandler(c *fiber.Ctx) error {
	healthy := h.aggregator.Health()
	
	status := fiber.StatusOK
	if !healthy {
		status = fiber.StatusServiceUnavailable
	}

	return c.Status(status).JSON(HealthResponse{
		Status:    getStatusString(healthy),
		Timestamp: time.Now(),
		Healthy:   healthy,
	})
}

// StatsHandler returns service statistics
// @Summary Get statistics
// @Description Returns aggregation statistics
// @Tags monitoring
// @Produce json
// @Success 200 {object} StatsResponse
// @Router /api/v1/stats [get]
func (h *Handler) StatsHandler(c *fiber.Ctx) error {
	stats := h.aggregator.GetStats()
	
	return c.JSON(StatsResponse{
		TotalRequests:    stats.TotalRequests,
		SuccessfulFetch:  stats.SuccessfulFetch,
		FailedFetch:      stats.FailedFetch,
		AverageDuration:  stats.AverageDuration.Milliseconds(),
		TotalDuration:    stats.TotalDuration.Milliseconds(),
		Timestamp:        time.Now(),
	})
}

// ResetStatsHandler resets service statistics
// @Summary Reset statistics
// @Description Resets all aggregation statistics
// @Tags monitoring
// @Produce json
// @Success 200 {object} MessageResponse
// @Router /api/v1/stats/reset [post]
func (h *Handler) ResetStatsHandler(c *fiber.Ctx) error {
	h.aggregator.ResetStats()
	
	return c.JSON(MessageResponse{
		Message: "Statistics reset successfully",
	})
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error     string    `json:"error"`
	Message   string    `json:"message"`
	RequestID string    `json:"request_id,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// HealthResponse represents a health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Healthy   bool      `json:"healthy"`
}

// StatsResponse represents statistics response
type StatsResponse struct {
	TotalRequests    int64     `json:"total_requests"`
	SuccessfulFetch  int64     `json:"successful_fetch"`
	FailedFetch      int64     `json:"failed_fetch"`
	AverageDuration  int64     `json:"average_duration_ms"`
	TotalDuration    int64     `json:"total_duration_ms"`
	Timestamp        time.Time `json:"timestamp"`
}

// MessageResponse represents a simple message response
type MessageResponse struct {
	Message string `json:"message"`
}

func getStatusString(healthy bool) string {
	if healthy {
		return "healthy"
	}
	return "unhealthy"
}
