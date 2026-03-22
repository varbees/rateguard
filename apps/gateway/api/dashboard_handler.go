package api

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/internal/analytics"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/internal/ratelimiter"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// getBaseURL returns the base URL for the API (for generating proxy URLs)
// It uses the request's host header as primary source, with fallback to BASE_URL env var
func getBaseURL(c *fiber.Ctx) string {
	// Priority 1: Use X-Forwarded-Proto and X-Forwarded-Host for proxied requests (common in cloud deployments)
	if proto := c.Get("X-Forwarded-Proto"); proto != "" {
		if host := c.Get("X-Forwarded-Host"); host != "" {
			return proto + "://" + host
		}
	}

	// Priority 2: Use X-Forwarded-Proto with Host header
	if proto := c.Get("X-Forwarded-Proto"); proto != "" {
		host := c.Hostname()
		if host != "" {
			return proto + "://" + host
		}
	}

	// Priority 3: Detect protocol from request scheme and use Host header
	scheme := c.Protocol()
	if scheme == "" {
		scheme = "https" // Default to HTTPS for production
	}
	host := c.Hostname()
	if host != "" {
		return scheme + "://" + host
	}

	// Priority 4: Use BASE_URL environment variable (for explicit configuration)
	if baseURL := os.Getenv("BASE_URL"); baseURL != "" {
		return baseURL
	}

	// Priority 5: Fallback for development
	return "http://localhost:8008"
}

// DashboardHandler handles dashboard and management API requests
type DashboardHandler struct {
	store         *storage.PostgresStore
	usageTracker  *storage.UsageTracker
	alertDetector *analytics.AlertDetector
	costEstimator *analytics.CostEstimator
	presetChecker *domainpolicy.PresetChecker
	redisLimiter  *ratelimiter.RedisRateLimiter
	proxyService  *proxy.ProxyService
}

// NewDashboardHandler creates a new dashboard handler
func NewDashboardHandler(store *storage.PostgresStore, tracker *storage.UsageTracker, alertDetector *analytics.AlertDetector, costEstimator *analytics.CostEstimator, redisLimiter *ratelimiter.RedisRateLimiter, proxyService *proxy.ProxyService) *DashboardHandler {
	return &DashboardHandler{
		store:         store,
		usageTracker:  tracker,
		alertDetector: alertDetector,
		costEstimator: costEstimator,
		presetChecker: domainpolicy.NewPresetChecker(store.GetDB(), logger.Log),
		redisLimiter:  redisLimiter,
		proxyService:  proxyService,
	}
}

// GetDashboardStats returns comprehensive dashboard statistics
// @Summary Get dashboard statistics
// @Description Returns overview statistics for the dashboard
// @Tags dashboard
// @Produce json
// @Success 200 {object} models.DashboardStats
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/stats [get]
func (h *DashboardHandler) GetDashboardStats(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	stats, err := h.usageTracker.GetDashboardStats(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to get dashboard stats",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve statistics",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Get user's policy preset features.
	preset, err := h.presetChecker.GetUserPreset(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to get policy preset", zap.Error(err))
		preset = "dev"
	}

	features, err := h.presetChecker.GetUserFeatures(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to get policy features", zap.Error(err))
		features = domainpolicy.GetPresetFeatures("dev")
	}

	// Get current usage counts
	apiCount, todayRequests, err := h.presetChecker.GetUsageStats(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to get usage stats", zap.Error(err))
		// Continue with zeros
	}

	// Get real-time rate limit usage from Redis if available
	var rateLimitUsage map[string]interface{}
	if h.redisLimiter != nil {
		// We can't easily get *all* APIs usage without iterating, but we can show
		// a summary or just indicate it's active.
		// For now, let's just return a flag indicating distributed rate limiting is active
		// and maybe some aggregate stats if we had them.
		rateLimitUsage = map[string]interface{}{
			"distributed_enabled": true,
			"backend":             "redis",
		}
	} else {
		rateLimitUsage = map[string]interface{}{
			"distributed_enabled": false,
			"backend":             "memory",
		}
	}

	// Get circuit breaker stats
	var circuitBreakerStats interface{}
	if h.proxyService != nil {
		circuitBreakerStats = h.proxyService.GetCircuitBreakerStats()
	}

	// Add preset information to response.
	presetSummary := fiber.Map{
		"tier":     preset,
		"features": features,
		"limits": fiber.Map{
			"apis": fiber.Map{
				"used": apiCount,
				"max":  features.MaxAPIs,
			},
			"requests": fiber.Map{
				"used": todayRequests,
				"max":  features.MaxRequestsPerDay,
			},
		},
	}

	return c.JSON(fiber.Map{
		"stats":                 stats,
		"rate_limit_usage":      rateLimitUsage,
		"circuit_breaker_stats": circuitBreakerStats,
		"preset":                presetSummary,
	})
}

// CreateAPIConfig creates a new API configuration
// @Summary Create API configuration
// @Description Create a new API configuration for proxying
// @Tags api-config
// @Accept json
// @Produce json
// @Param request body models.CreateAPIConfigRequest true "API configuration"
// @Success 201 {object} models.APIConfig
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/apis [post]
func (h *DashboardHandler) CreateAPIConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse request
	var req models.CreateAPIConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Normalize and validate API name (slugify)
	normalizedName, err := models.NormalizeAndValidateAPIName(req.Name)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid API name",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}
	req.Name = normalizedName

	// Derive a slug from the name when the caller does not provide one.
	if strings.TrimSpace(req.Slug) == "" {
		req.Slug = normalizedName
	} else {
		normalizedSlug, err := models.NormalizeAndValidateAPIName(req.Slug)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Error:     "Invalid API slug",
				Message:   err.Error(),
				Timestamp: time.Now(),
			})
		}
		req.Slug = normalizedSlug
	}

	// Validate allowed origins
	if len(req.AllowedOrigins) > 0 {
		if err := models.ValidateAllowedOrigins(req.AllowedOrigins); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Error:     "Invalid origins",
				Message:   err.Error(),
				Timestamp: time.Now(),
			})
		}
	}

	// Check policy preset limits using the preset checker when available.
	if h.presetChecker != nil {
		canCreate, message, err := h.presetChecker.CanCreateAPI(c.Context(), user.ID)
		if err != nil {
			logger.Error("Failed to check preset limits",
				zap.String("user_id", user.ID.String()),
				zap.Error(err),
			)
			return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
				Error:     "Failed to check preset",
				Message:   "Unable to verify preset limits",
				Timestamp: time.Now(),
			})
		}
		if !canCreate {
			// Get current preset for response.
			preset, _ := h.presetChecker.GetUserPreset(c.Context(), user.ID)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":          "Policy limit reached",
				"message":        message,
				"docs_url":       "/docs/guides/rate-limiting",
				"current_preset": preset,
			})
		}
	}

	// Set defaults
	if req.TimeoutSeconds == 0 {
		req.TimeoutSeconds = 30
	}

	// Create API config
	config := &models.APIConfig{
		ID:                 uuid.New(),
		UserID:             user.ID,
		Name:               req.Name,
		Slug:               req.Slug,
		TargetURL:          req.TargetURL,
		RateLimitPerSecond: req.RateLimitPerSecond,
		BurstSize:          req.BurstSize,
		RateLimitPerHour:   req.RateLimitPerHour,
		RateLimitPerDay:    req.RateLimitPerDay,
		RateLimitPerMonth:  req.RateLimitPerMonth,
		Enabled:            true,
		AllowedOrigins:     req.AllowedOrigins,
		CustomHeaders:      req.CustomHeaders,
		AuthType:           req.AuthType,
		AuthCredentials:    req.AuthCredentials,
		TimeoutSeconds:     req.TimeoutSeconds,
		RetryAttempts:      req.RetryAttempts,
	}

	if err := h.store.CreateAPIConfig(c.Context(), config); err != nil {
		// Check if it's a duplicate API name
		if errors.Is(err, models.ErrAPIConfigAlreadyExists) {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Error:     "API configuration already exists",
				Message:   fmt.Sprintf("An API with name '%s' already exists", req.Name),
				Timestamp: time.Now(),
			})
		}

		logger.Error("Failed to create API config",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to create API configuration",
			Message:   "An unexpected error occurred",
			Timestamp: time.Now(),
		})
	}

	logger.Info("API config created",
		zap.String("user_id", user.ID.String()),
		zap.String("api_name", config.Name),
	)

	// Set proxy URL for response
	config.SetProxyURL(getBaseURL(c))

	return c.Status(fiber.StatusCreated).JSON(config)
}

// UpdateAPIConfig updates an existing API configuration
// @Summary Update API configuration
// @Description Update an existing API configuration
// @Tags api-config
// @Accept json
// @Produce json
// @Param id path string true "API Config ID"
// @Param request body models.UpdateAPIConfigRequest true "Update payload"
// @Success 200 {object} models.APIConfig
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/apis/{id} [put]
func (h *DashboardHandler) UpdateAPIConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse config ID from URL
	configID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid ID",
			Message:   "Invalid API configuration ID format",
			Timestamp: time.Now(),
		})
	}

	// Parse request body
	var req models.UpdateAPIConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Normalize and validate API name if being updated
	if req.Name != nil && *req.Name != "" {
		normalizedName, err := models.NormalizeAndValidateAPIName(*req.Name)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Error:     "Invalid API name",
				Message:   err.Error(),
				Timestamp: time.Now(),
			})
		}
		req.Name = &normalizedName
	}

	// Validate allowed origins if being updated
	if len(req.AllowedOrigins) > 0 {
		if err := models.ValidateAllowedOrigins(req.AllowedOrigins); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Error:     "Invalid origins",
				Message:   err.Error(),
				Timestamp: time.Now(),
			})
		}
	}

	// Get existing config to merge updates
	existing, err := h.store.GetAPIConfig(c.Context(), configID, user.ID)
	if err != nil {
		if errors.Is(err, models.ErrAPIConfigNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Not found",
				Message:   "API configuration not found",
				Timestamp: time.Now(),
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to fetch configuration",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Apply updates to existing config
	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.TargetURL != nil {
		existing.TargetURL = *req.TargetURL
	}
	if req.RateLimitPerSecond != nil {
		existing.RateLimitPerSecond = *req.RateLimitPerSecond
	}
	if req.BurstSize != nil {
		existing.BurstSize = *req.BurstSize
	}
	if req.RateLimitPerHour != nil {
		existing.RateLimitPerHour = *req.RateLimitPerHour
	}
	if req.RateLimitPerDay != nil {
		existing.RateLimitPerDay = *req.RateLimitPerDay
	}
	if req.RateLimitPerMonth != nil {
		existing.RateLimitPerMonth = *req.RateLimitPerMonth
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	if req.AllowedOrigins != nil {
		existing.AllowedOrigins = req.AllowedOrigins
	}
	if req.TimeoutSeconds != nil {
		existing.TimeoutSeconds = *req.TimeoutSeconds
	}
	if req.RetryAttempts != nil {
		existing.RetryAttempts = *req.RetryAttempts
	}
	if req.CustomHeaders != nil {
		existing.CustomHeaders = req.CustomHeaders
	}
	if req.AuthType != nil {
		existing.AuthType = *req.AuthType
	}
	if req.AuthCredentials != nil {
		existing.AuthCredentials = req.AuthCredentials
	}

	// Update in database
	if err := h.store.UpdateAPIConfig(c.Context(), configID, user.ID, existing); err != nil {
		if errors.Is(err, models.ErrAPIConfigNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Not found",
				Message:   "API configuration not found",
				Timestamp: time.Now(),
			})
		}
		if errors.Is(err, models.ErrAPIConfigAlreadyExists) {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Error:     "Conflict",
				Message:   "An API with this name already exists",
				Timestamp: time.Now(),
			})
		}

		logger.Error("Failed to update API config",
			zap.String("user_id", user.ID.String()),
			zap.String("config_id", configID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to update configuration",
			Message:   "An unexpected error occurred",
			Timestamp: time.Now(),
		})
	}

	logger.Info("API config updated",
		zap.String("user_id", user.ID.String()),
		zap.String("config_id", configID.String()),
	)

	// Set proxy URL for response
	existing.SetProxyURL(getBaseURL(c))

	return c.JSON(existing)
}

// ListAPIConfigs lists all API configurations for the user
// @Summary List API configurations
// @Description List all API configurations for the authenticated user
// @Tags api-config
// @Produce json
// @Success 200 {object} models.APIConfigListResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/apis [get]
func (h *DashboardHandler) ListAPIConfigs(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	configs, err := h.store.ListAPIConfigs(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to list API configs",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve API configurations",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Return array directly to match the frontend contract
	if configs == nil {
		configs = []models.APIConfig{}
	}

	// Set proxy URLs for all configs
	baseURL := getBaseURL(c)
	for i := range configs {
		configs[i].SetProxyURL(baseURL)
	}

	return c.JSON(configs)
}

// GetAPIConfig retrieves a specific API configuration
// @Summary Get API configuration
// @Description Get a specific API configuration by ID
// @Tags api-config
// @Produce json
// @Param id path string true "API Config ID"
// @Success 200 {object} models.APIConfig
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/apis/{id} [get]
func (h *DashboardHandler) GetAPIConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	configID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid ID",
			Message:   "Invalid API configuration ID",
			Timestamp: time.Now(),
		})
	}

	config, err := h.store.GetAPIConfig(c.Context(), configID, user.ID)
	if err != nil {
		if err == models.ErrAPIConfigNotFound {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Not found",
				Message:   "API configuration not found",
				Timestamp: time.Now(),
			})
		}

		logger.Error("Failed to get API config",
			zap.String("user_id", user.ID.String()),
			zap.String("config_id", configID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve API configuration",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Set proxy URL for response
	config.SetProxyURL(getBaseURL(c))

	return c.JSON(config)
}

// DeleteAPIConfig deletes an API configuration
// @Summary Delete API configuration
// @Description Delete a specific API configuration by ID
// @Tags api-config
// @Param id path string true "API Config ID"
// @Success 200 {object} MessageResponse
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/apis/{id} [delete]
func (h *DashboardHandler) DeleteAPIConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	configID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid ID",
			Message:   "Invalid API configuration ID",
			Timestamp: time.Now(),
		})
	}

	if err := h.store.DeleteAPIConfig(c.Context(), configID, user.ID); err != nil {
		if err == models.ErrAPIConfigNotFound {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Not found",
				Message:   "API configuration not found",
				Timestamp: time.Now(),
			})
		}

		logger.Error("Failed to delete API config",
			zap.String("user_id", user.ID.String()),
			zap.String("config_id", configID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to delete API configuration",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	logger.Info("API config deleted",
		zap.String("user_id", user.ID.String()),
		zap.String("config_id", configID.String()),
	)

	return c.JSON(MessageResponse{
		Message: "API configuration deleted successfully",
	})
}

// GetUsageStats retrieves usage statistics
// @Summary Get usage statistics
// @Description Get usage statistics for a specific time period
// @Tags dashboard
// @Produce json
// @Param start_date query string false "Start date (RFC3339)"
// @Param end_date query string false "End date (RFC3339)"
// @Success 200 {object} models.UsageStats
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/usage [get]
func (h *DashboardHandler) GetUsageStats(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse time range (default to last 30 days)
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -30)

	if startStr := c.Query("start_date"); startStr != "" {
		if parsed, err := time.Parse(time.RFC3339, startStr); err == nil {
			startDate = parsed
		}
	}

	if endStr := c.Query("end_date"); endStr != "" {
		if parsed, err := time.Parse(time.RFC3339, endStr); err == nil {
			endDate = parsed
		}
	}

	stats, err := h.usageTracker.GetUsage(c.Context(), user.ID, startDate, endDate)
	if err != nil {
		logger.Error("Failed to get usage stats",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve usage statistics",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	return c.JSON(stats)
}

// GetStreamingStats returns streaming-specific statistics
// @Summary Get streaming statistics
// @Description Returns streaming metrics (total streams, bytes, durations)
// @Tags dashboard
// @Produce json
// @Param period query string false "Time period (24h, 7d, 30d)" default(30d)
// @Success 200 {object} StreamingStatsResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/stats/streaming [get]
func (h *DashboardHandler) GetStreamingStats(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse period parameter
	period := c.Query("period", "30d")
	var startDate time.Time
	endDate := time.Now()

	switch period {
	case "24h":
		startDate = endDate.Add(-24 * time.Hour)
	case "7d":
		startDate = endDate.AddDate(0, 0, -7)
	case "30d":
		startDate = endDate.AddDate(0, 0, -30)
	default:
		startDate = endDate.AddDate(0, 0, -30)
	}

	// Get streaming stats
	stats, err := h.usageTracker.GetStreamingStats(c.Context(), user.ID, startDate, endDate)
	if err != nil {
		logger.Error("Failed to get streaming stats",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve streaming statistics",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Convert to response format
	activeStreams, _ := stats["active_streams"].(int)
	successRate, _ := stats["success_rate"].(float64)
	response := StreamingStatsResponse{
		TotalStreams:     stats["total_streams"].(int64),
		TotalBytes:       stats["total_bytes"].(int64),
		TotalBytesGB:     float64(stats["total_bytes"].(int64)) / (1024 * 1024 * 1024),
		AvgDurationMs:    stats["avg_stream_duration_ms"].(float64),
		MaxDurationMs:    stats["max_stream_duration_ms"].(int64),
		ActiveStreams:    activeStreams,
		SuccessRate:      successRate,
		StreamingEnabled: stats["streaming_enabled"].(bool),
	}

	return c.JSON(response)
}

// GetStreamingHistory returns streaming metrics over time
// @Summary Get streaming history
// @Description Returns time-series data for streaming metrics
// @Tags dashboard
// @Produce json
// @Param period query string false "Time period (24h, 7d, 30d)" default(7d)
// @Success 200 {object} StreamingHistoryResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/streaming/history [get]
func (h *DashboardHandler) GetStreamingHistory(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse period parameter
	period := c.Query("period", "7d")
	var startDate time.Time
	endDate := time.Now()

	switch period {
	case "24h":
		startDate = endDate.Add(-24 * time.Hour)
	case "7d":
		startDate = endDate.AddDate(0, 0, -7)
	case "30d":
		startDate = endDate.AddDate(0, 0, -30)
	default:
		startDate = endDate.AddDate(0, 0, -7)
	}

	// Query streaming history from database
	query := `
		SELECT 
			DATE_TRUNC('hour', timestamp) as hour,
			COUNT(*) as streams,
			COALESCE(SUM(bytes_streamed), 0) as bytes,
			COALESCE(AVG(stream_duration_ms), 0) as avg_duration_ms
		FROM api_metrics
		WHERE user_id = $1 
			AND timestamp BETWEEN $2 AND $3
			AND is_streaming = true
		GROUP BY hour
		ORDER BY hour ASC
	`

	rows, err := h.store.GetDB().QueryContext(c.Context(), query, user.ID, startDate, endDate)
	if err != nil {
		logger.Error("Failed to get streaming history",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve streaming history",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}
	defer rows.Close()

	var data []StreamingHistoryPoint
	for rows.Next() {
		var point StreamingHistoryPoint
		if err := rows.Scan(&point.Timestamp, &point.Streams, &point.Bytes, &point.AvgDurationMs); err != nil {
			logger.Error("Failed to scan streaming history row",
				zap.Error(err),
			)
			continue
		}
		data = append(data, point)
	}

	// If no data, return empty array (not null)
	if data == nil {
		data = []StreamingHistoryPoint{}
	}

	return c.JSON(StreamingHistoryResponse{Data: data})
}

// GetStreamingByAPI returns streaming breakdown by API
// @Summary Get streaming by API
// @Description Returns streaming metrics grouped by API
// @Tags dashboard
// @Produce json
// @Param period query string false "Time period (24h, 7d, 30d)" default(30d)
// @Success 200 {object} ApiBreakdownResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/streaming/by-api [get]
func (h *DashboardHandler) GetStreamingByAPI(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse period parameter
	period := c.Query("period", "30d")
	var startDate time.Time
	endDate := time.Now()

	switch period {
	case "24h":
		startDate = endDate.Add(-24 * time.Hour)
	case "7d":
		startDate = endDate.AddDate(0, 0, -7)
	case "30d":
		startDate = endDate.AddDate(0, 0, -30)
	default:
		startDate = endDate.AddDate(0, 0, -30)
	}

	// Query streaming by API
	query := `
		SELECT 
			ac.id as api_id,
			ac.name as api_name,
			COUNT(m.id) as streams,
			COALESCE(SUM(m.bytes_streamed), 0) as bytes,
			COALESCE(AVG(m.stream_duration_ms), 0) as avg_duration_ms,
			COALESCE(
				100.0 * SUM(CASE WHEN m.status_code >= 200 AND m.status_code < 300 THEN 1 ELSE 0 END) / 
				NULLIF(COUNT(m.id), 0), 
				0
			) as success_rate
		FROM api_configs ac
		LEFT JOIN api_metrics m ON m.target_api = ac.name AND m.user_id = ac.user_id
			AND m.timestamp BETWEEN $2 AND $3
			AND m.is_streaming = true
		WHERE ac.user_id = $1
		GROUP BY ac.id, ac.name
		HAVING COUNT(m.id) > 0
		ORDER BY streams DESC
	`

	rows, err := h.store.GetDB().QueryContext(c.Context(), query, user.ID, startDate, endDate)
	if err != nil {
		logger.Error("Failed to get streaming by API",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve API breakdown",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}
	defer rows.Close()

	var apis []ApiStreamingBreakdown
	for rows.Next() {
		var api ApiStreamingBreakdown
		if err := rows.Scan(&api.ApiID, &api.ApiName, &api.Streams, &api.Bytes, &api.AvgDurationMs, &api.SuccessRate); err != nil {
			logger.Error("Failed to scan API breakdown row",
				zap.Error(err),
			)
			continue
		}
		apis = append(apis, api)
	}

	// If no data, return empty array
	if apis == nil {
		apis = []ApiStreamingBreakdown{}
	}

	return c.JSON(ApiBreakdownResponse{APIs: apis})
}

// GetAlerts returns current dashboard alerts for the user
// @Summary Get dashboard alerts
// @Description Returns real-time alerts about rate limits and API issues
// @Tags dashboard
// @Produce json
// @Success 200 {object} models.AlertsResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/alerts [get]
func (h *DashboardHandler) GetAlerts(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Get alerts from detector
	alerts := h.alertDetector.GetAlerts(user.ID)

	return c.JSON(models.AlertsResponse{
		Alerts: alerts,
		Count:  len(alerts),
	})
}

// StreamingStatsResponse represents streaming statistics
type StreamingStatsResponse struct {
	TotalStreams     int64   `json:"total_streams"`
	TotalBytes       int64   `json:"total_bytes"`
	TotalBytesGB     float64 `json:"total_bytes_gb"`
	AvgDurationMs    float64 `json:"avg_duration_ms"`
	MaxDurationMs    int64   `json:"max_duration_ms"`
	ActiveStreams    int     `json:"active_streams"`
	SuccessRate      float64 `json:"success_rate"`
	StreamingEnabled bool    `json:"streaming_enabled"`
}

// StreamingHistoryPoint represents a single point in streaming history
type StreamingHistoryPoint struct {
	Timestamp     time.Time `json:"timestamp"`
	Streams       int64     `json:"streams"`
	Bytes         int64     `json:"bytes"`
	AvgDurationMs float64   `json:"avg_duration_ms"`
}

// StreamingHistoryResponse represents streaming history data
type StreamingHistoryResponse struct {
	Data []StreamingHistoryPoint `json:"data"`
}

// ApiStreamingBreakdown represents streaming metrics for a specific API
type ApiStreamingBreakdown struct {
	ApiID         string  `json:"api_id"`
	ApiName       string  `json:"api_name"`
	Streams       int64   `json:"streams"`
	Bytes         int64   `json:"bytes"`
	AvgDurationMs float64 `json:"avg_duration_ms"`
	SuccessRate   float64 `json:"success_rate"`
}

// ApiBreakdownResponse represents API streaming breakdown
type ApiBreakdownResponse struct {
	APIs []ApiStreamingBreakdown `json:"apis"`
}

// GetCostEstimate returns API cost estimates
// @Summary Get cost estimates
// @Description Returns today's cost and monthly projection
// @Tags dashboard
// @Produce json
// @Success 200 {object} models.CostEstimate
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/costs [get]
func (h *DashboardHandler) GetCostEstimate(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	estimate, err := h.costEstimator.GetCostEstimate(c.Context(), userID)
	if err != nil {
		logger.Log.Error("Failed to get cost estimate",
			zap.String("user_id", userID.String()),
			zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve cost estimate",
		})
	}

	return c.JSON(estimate)
}

// GetUsageHistory returns time-series usage data
// @Summary Get usage history
// @Description Returns hourly aggregated usage data for graphing
// @Tags dashboard
// @Produce json
// @Param period query string false "Time period (24h, 7d, 30d)" default(7d)
// @Success 200 {object} models.UsageHistoryResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/usage/history [get]
func (h *DashboardHandler) GetUsageHistory(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	period := c.Query("period", "7d")

	// Validate period
	validPeriods := map[string]bool{"24h": true, "7d": true, "30d": true}
	if !validPeriods[period] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid period. Must be one of: 24h, 7d, 30d",
		})
	}

	historyData, err := h.usageTracker.GetUsageHistory(c.Context(), userID, period)
	if err != nil {
		logger.Log.Error("Failed to get usage history",
			zap.String("user_id", userID.String()),
			zap.String("period", period),
			zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve usage history",
		})
	}

	response := models.UsageHistoryResponse{
		Period: period,
		Data:   historyData,
	}

	return c.JSON(response)
}

// GetRecentRequests returns recent API requests with details
// @Summary Get recent requests
// @Description Returns recent API requests with filtering options
// @Tags dashboard
// @Produce json
// @Param limit query int false "Maximum number of requests to return (max 100)" default(10)
// @Param api_id query string false "Filter by API ID"
// @Param status_code query int false "Filter by HTTP status code"
// @Success 200 {object} models.RecentRequestsResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/requests/recent [get]
func (h *DashboardHandler) GetRecentRequests(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	// Parse query parameters
	limit := c.QueryInt("limit", 10)
	filters := make(map[string]interface{})

	if apiID := c.Query("api_id"); apiID != "" {
		filters["api_id"] = apiID
	}

	if statusCode := c.QueryInt("status_code", 0); statusCode > 0 {
		filters["status_code"] = statusCode
	}

	requests, total, err := h.usageTracker.GetRecentRequests(c.Context(), userID, limit, filters)
	if err != nil {
		logger.Log.Error("Failed to get recent requests",
			zap.String("user_id", userID.String()),
			zap.Int("limit", limit),
			zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve recent requests",
		})
	}

	response := models.RecentRequestsResponse{
		Requests: requests,
		Total:    total,
	}

	return c.JSON(response)
}

// TestConnectionRequest represents the request body for testing API connections
type TestConnectionRequest struct {
	TargetURL       string            `json:"target_url" validate:"required,url"`
	AuthType        string            `json:"auth_type" validate:"required,oneof=none bearer api_key basic"`
	AuthCredentials map[string]string `json:"auth_credentials,omitempty"`
	TimeoutSeconds  int               `json:"timeout_seconds,omitempty"`
}

// TestConnectionResponse represents the result of a connection test
type TestConnectionResponse struct {
	Success      bool   `json:"success"`
	StatusCode   int    `json:"status_code,omitempty"`
	StatusText   string `json:"status_text,omitempty"`
	LatencyMs    int64  `json:"latency_ms"`
	ErrorMessage string `json:"error_message,omitempty"`
	ErrorCode    string `json:"error_code,omitempty"`
	ServerInfo   string `json:"server_info,omitempty"`
	ContentType  string `json:"content_type,omitempty"`
	TLSVersion   string `json:"tls_version,omitempty"`
	TestedAt     string `json:"tested_at"`
}

// TestConnection tests connectivity to a target API with provided credentials
// @Summary Test API connection
// @Description Tests connectivity and authentication to a target API endpoint
// @Tags api-config
// @Accept json
// @Produce json
// @Param request body TestConnectionRequest true "Connection test parameters"
// @Success 200 {object} TestConnectionResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/apis/test-connection [post]
func (h *DashboardHandler) TestConnection(c *fiber.Ctx) error {
	// Authenticate user
	_, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse request
	var req TestConnectionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Validate target URL
	if req.TargetURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Missing target URL",
			Message:   "target_url is required",
			Timestamp: time.Now(),
		})
	}

	// Validate URL format
	if !strings.HasPrefix(req.TargetURL, "http://") && !strings.HasPrefix(req.TargetURL, "https://") {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid URL format",
			Message:   "target_url must start with http:// or https://",
			Timestamp: time.Now(),
		})
	}

	// Set default timeout
	timeout := 10 * time.Second
	if req.TimeoutSeconds > 0 && req.TimeoutSeconds <= 30 {
		timeout = time.Duration(req.TimeoutSeconds) * time.Second
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: false, // Always verify TLS in production
			},
		},
	}

	// Create request
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, "HEAD", req.TargetURL, nil)
	if err != nil {
		return c.JSON(TestConnectionResponse{
			Success:      false,
			ErrorMessage: fmt.Sprintf("Failed to create request: %s", err.Error()),
			ErrorCode:    "REQUEST_CREATION_FAILED",
			TestedAt:     time.Now().UTC().Format(time.RFC3339),
		})
	}

	// Set User-Agent
	httpReq.Header.Set("User-Agent", "RateGuard-ConnectionTest/1.0")

	// Apply authentication based on auth_type
	switch req.AuthType {
	case "bearer":
		if token, ok := req.AuthCredentials["token"]; ok && token != "" {
			httpReq.Header.Set("Authorization", "Bearer "+token)
		}
	case "api_key":
		headerName := req.AuthCredentials["header_name"]
		if headerName == "" {
			headerName = "X-API-Key"
		}
		if key, ok := req.AuthCredentials["key"]; ok && key != "" {
			httpReq.Header.Set(headerName, key)
		}
	case "basic":
		username := req.AuthCredentials["username"]
		password := req.AuthCredentials["password"]
		if username != "" {
			auth := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
			httpReq.Header.Set("Authorization", "Basic "+auth)
		}
	}

	// Execute request and measure latency
	startTime := time.Now()
	resp, err := client.Do(httpReq)
	latencyMs := time.Since(startTime).Milliseconds()

	// Handle connection errors
	if err != nil {
		errorCode := "CONNECTION_FAILED"
		errorMsg := err.Error()

		// Categorize common errors
		if strings.Contains(errorMsg, "no such host") {
			errorCode = "DNS_RESOLUTION_FAILED"
			errorMsg = "Unable to resolve hostname. Please check the URL."
		} else if strings.Contains(errorMsg, "connection refused") {
			errorCode = "CONNECTION_REFUSED"
			errorMsg = "Connection refused. The server may be down or blocking requests."
		} else if strings.Contains(errorMsg, "timeout") || strings.Contains(errorMsg, "deadline exceeded") {
			errorCode = "TIMEOUT"
			errorMsg = fmt.Sprintf("Connection timed out after %d seconds.", int(timeout.Seconds()))
		} else if strings.Contains(errorMsg, "certificate") {
			errorCode = "TLS_ERROR"
			errorMsg = "TLS/SSL certificate verification failed."
		} else if strings.Contains(errorMsg, "network is unreachable") {
			errorCode = "NETWORK_UNREACHABLE"
			errorMsg = "Network is unreachable. Please check your internet connection."
		}

		return c.JSON(TestConnectionResponse{
			Success:      false,
			LatencyMs:    latencyMs,
			ErrorMessage: errorMsg,
			ErrorCode:    errorCode,
			TestedAt:     time.Now().UTC().Format(time.RFC3339),
		})
	}
	defer resp.Body.Close()

	// Extract useful response information
	serverInfo := resp.Header.Get("Server")
	contentType := resp.Header.Get("Content-Type")

	// Get TLS version if available
	tlsVersion := ""
	if resp.TLS != nil {
		switch resp.TLS.Version {
		case tls.VersionTLS10:
			tlsVersion = "TLS 1.0"
		case tls.VersionTLS11:
			tlsVersion = "TLS 1.1"
		case tls.VersionTLS12:
			tlsVersion = "TLS 1.2"
		case tls.VersionTLS13:
			tlsVersion = "TLS 1.3"
		}
	}

	// Determine success based on status code
	success := resp.StatusCode >= 200 && resp.StatusCode < 400

	// If HEAD fails, some servers might not support it, try GET
	if resp.StatusCode == 405 { // Method Not Allowed
		httpReq.Method = "GET"
		startTime = time.Now()
		resp2, err2 := client.Do(httpReq)
		latencyMs = time.Since(startTime).Milliseconds()
		if err2 == nil {
			defer resp2.Body.Close()
			success = resp2.StatusCode >= 200 && resp2.StatusCode < 400
			return c.JSON(TestConnectionResponse{
				Success:     success,
				StatusCode:  resp2.StatusCode,
				StatusText:  http.StatusText(resp2.StatusCode),
				LatencyMs:   latencyMs,
				ServerInfo:  resp2.Header.Get("Server"),
				ContentType: resp2.Header.Get("Content-Type"),
				TLSVersion:  tlsVersion,
				TestedAt:    time.Now().UTC().Format(time.RFC3339),
			})
		}
	}

	// Return result
	response := TestConnectionResponse{
		Success:     success,
		StatusCode:  resp.StatusCode,
		StatusText:  http.StatusText(resp.StatusCode),
		LatencyMs:   latencyMs,
		ServerInfo:  serverInfo,
		ContentType: contentType,
		TLSVersion:  tlsVersion,
		TestedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	// Add error message for non-success status codes
	if !success {
		switch resp.StatusCode {
		case 401:
			response.ErrorMessage = "Authentication failed. Please check your credentials."
			response.ErrorCode = "AUTH_FAILED"
		case 403:
			response.ErrorMessage = "Access forbidden. Your API key may not have permission."
			response.ErrorCode = "FORBIDDEN"
		case 404:
			response.ErrorMessage = "Endpoint not found. Please check the URL."
			response.ErrorCode = "NOT_FOUND"
		case 429:
			response.ErrorMessage = "Rate limited by target API. Try again later."
			response.ErrorCode = "RATE_LIMITED"
		default:
			response.ErrorMessage = fmt.Sprintf("Server returned %d %s", resp.StatusCode, http.StatusText(resp.StatusCode))
			response.ErrorCode = "HTTP_ERROR"
		}
	}

	logger.Info("Connection test completed",
		zap.String("target_url", req.TargetURL),
		zap.Bool("success", success),
		zap.Int("status_code", resp.StatusCode),
		zap.Int64("latency_ms", latencyMs),
	)

	return c.JSON(response)
}
