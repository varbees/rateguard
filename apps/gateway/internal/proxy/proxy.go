package proxy

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	httpadapter "github.com/varbees/rateguard/internal/adapters/http"
	domaingateway "github.com/varbees/rateguard/internal/domain/gateway"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/ratelimiter"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/internal/websocket"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// ProxyService handles proxied API requests with rate limiting and tracking
type ProxyService struct {
	httpClient      *http.Client
	rateLimiter     *ratelimiter.MultiLimiter
	redisLimiter    *ratelimiter.RedisRateLimiter // Optional: for multi-tier rate limiting
	usageTracker    *storage.UsageTracker
	store           *storage.PostgresStore
	presetChecker   *domainpolicy.PresetChecker
	circuitBreakers *CircuitBreakerManager // Circuit breaker for fault tolerance
	webSocketHub    *websocket.Hub
}

// NewProxyService creates a new proxy service
func NewProxyService(
	limiter *ratelimiter.MultiLimiter,
	tracker *storage.UsageTracker,
	store *storage.PostgresStore,
	redisLimiter *ratelimiter.RedisRateLimiter, // Optional: pass nil to disable multi-tier limits
	cbConfig CircuitBreakerConfig,
	webSocketHub *websocket.Hub,
) *ProxyService {
	// Define callback for circuit breaker state changes
	onStateChange := func(userID, apiID, apiName string, state CircuitState) {
		if webSocketHub != nil {
			if err := webSocketHub.PublishCircuitBreakerUpdate(userID, apiID, apiName, string(state)); err != nil {
				logger.Error("Failed to publish circuit breaker update",
					zap.String("user_id", userID),
					zap.String("api_id", apiID),
					zap.String("state", string(state)),
					zap.Error(err),
				)
			}
		}
	}

	return &ProxyService{
		httpClient: &http.Client{
			Timeout:   60 * time.Second,
			Transport: NewSafeTransport(),
		},
		rateLimiter:     limiter,
		redisLimiter:    redisLimiter,
		usageTracker:    tracker,
		store:           store,
		presetChecker:   domainpolicy.NewPresetChecker(store.GetDB(), logger.Log),
		circuitBreakers: NewCircuitBreakerManager(cbConfig, onStateChange),
		webSocketHub:    webSocketHub,
	}
}

// ProxyRequest handles a proxied API call with rate limiting and tracking
func (p *ProxyService) ProxyRequest(ctx context.Context, req *models.ProxyRequest) (*models.ProxyResponse, error) {
	startTime := time.Now()
	response := &models.ProxyResponse{
		RequestID: req.ID,
		Timestamp: startTime,
	}

	// Get API configuration
	apiConfig, err := p.store.GetAPIConfigByName(ctx, req.TargetAPI, req.UserID)
	if err != nil {
		logger.Error("Failed to get API configuration",
			zap.String("user_id", req.UserID.String()),
			zap.String("api_name", req.TargetAPI),
			zap.Error(err),
		)
		return nil, models.ErrAPINotFound
	}

	if !apiConfig.Enabled {
		logger.Warn("Attempted to use disabled API",
			zap.String("user_id", req.UserID.String()),
			zap.String("api_name", req.TargetAPI),
		)
		return nil, models.ErrAPIDisabled
	}

	// Check multi-tier rate limits
	allowed, limitType := p.checkMultiTierRateLimits(req.UserID, req.TargetAPI, apiConfig)
	if !allowed {
		logger.Warn("Rate limit exceeded",
			zap.String("user_id", req.UserID.String()),
			zap.String("api_name", req.TargetAPI),
			zap.String("limit_type", limitType),
		)

		response.StatusCode = http.StatusTooManyRequests
		response.Error = &models.ProxyError{
			Code:    "RATE_LIMIT_EXCEEDED",
			Message: fmt.Sprintf("Rate limit exceeded (%s)", limitType),
			Details: domaingateway.GetRateLimitDetails(apiConfig, limitType),
		}
		return response, models.ErrRateLimitExceeded
	}

	// Record request for billing/analytics
	if err := p.usageTracker.RecordRequest(ctx, req.UserID, req.TargetAPI); err != nil {
		logger.Error("Failed to record usage", zap.Error(err))
		// Don't fail the request if tracking fails
	}

	// Build target URL
	targetURL := domaingateway.BuildTargetURL(apiConfig.TargetURL, req.QueryParams)

	// Build target request
	targetReq, err := http.NewRequestWithContext(ctx, req.Method, targetURL, bytes.NewReader(req.Body))
	if err != nil {
		logger.Error("Failed to create request",
			zap.String("user_id", req.UserID.String()),
			zap.Error(err),
		)
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Apply custom headers from API config
	for k, v := range apiConfig.CustomHeaders {
		targetReq.Header.Set(k, v)
	}

	// Apply request headers (user-provided headers override config headers)
	for k, v := range req.Headers {
		targetReq.Header.Set(k, v)
	}

	// Apply authentication
	domaingateway.ApplyAuthentication(targetReq, apiConfig)

	// Set timeout from config
	if apiConfig.TimeoutSeconds > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(apiConfig.TimeoutSeconds)*time.Second)
		defer cancel()
		targetReq = targetReq.WithContext(ctx)
	}

	// Execute request with retry logic and circuit breaker protection
	resp, err := httpadapter.ExecuteWithCircuitBreakerAndRetry(
		p.circuitBreakers.GetOrCreate(apiConfig.ID.String(), apiConfig.Name, apiConfig.UserID.String()),
		p.httpClient,
		targetReq,
		apiConfig.RetryAttempts,
		req.UserID.String(),
		req.TargetAPI,
	)
	duration := time.Since(startTime)

	if err != nil {
		logger.Error("Proxy request failed",
			zap.String("user_id", req.UserID.String()),
			zap.String("target_api", req.TargetAPI),
			zap.Duration("duration", duration),
			zap.Error(err),
		)

		response = buildProxyRequestFailureResponse(req.ID, startTime, duration, err)

		// Record failed response
		p.usageTracker.RecordResponse(ctx, req.UserID, req.TargetAPI, response.StatusCode, duration)

		return response, err
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Error("Failed to read response body",
			zap.String("user_id", req.UserID.String()),
			zap.Error(err),
		)
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Build response
	response = buildProxyBufferedResponse(response, resp.StatusCode, resp.Header, body, duration)

	// Record successful response metrics
	if err := p.usageTracker.RecordResponse(ctx, req.UserID, req.TargetAPI, resp.StatusCode, duration); err != nil {
		logger.Error("Failed to record response metrics", zap.Error(err))
	}

	p.handleProxyLLMResponse(ctx, req.UserID, req.TargetAPI, apiConfig, body, resp.StatusCode, duration)

	logger.Info("Proxy request completed",
		zap.String("user_id", req.UserID.String()),
		zap.String("target_api", req.TargetAPI),
		zap.Int("status", resp.StatusCode),
		zap.Duration("duration", duration),
	)

	return response, nil
}

// handleLLMResponse extracts tokens and records LLM-specific metrics
func (p *ProxyService) handleLLMResponse(
	ctx context.Context,
	userID uuid.UUID,
	apiName string,
	apiConfig *models.APIConfig,
	responseBody []byte,
	statusCode int,
	duration time.Duration,
) {
	if apiConfig.Provider == nil {
		logger.Warn("LLM API has no provider set, skipping token extraction",
			zap.String("api_name", apiName),
		)
		return
	}

	provider := *apiConfig.Provider

	// Extract tokens from response
	tokenUsage, err := ExtractTokensFromResponse(provider, responseBody)
	if err != nil {
		logger.Error("Failed to extract tokens from LLM response",
			zap.String("provider", provider),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		return
	}

	// Calculate cost in cents
	costCents, calcErr := p.calculateTokenCost(ctx, provider, tokenUsage.Model, tokenUsage.InputTokens, tokenUsage.OutputTokens)
	if calcErr != nil {
		logger.Error("Failed to calculate token cost",
			zap.String("provider", provider),
			zap.String("model", tokenUsage.Model),
			zap.Error(calcErr),
		)
		// Use fallback cost if calculation fails
		costCents = 0
	}

	// Record LLM metrics
	if err := p.usageTracker.RecordLLMResponse(
		ctx,
		userID,
		apiName,
		tokenUsage.Model,
		tokenUsage.InputTokens,
		tokenUsage.OutputTokens,
		costCents,
		statusCode,
		duration,
	); err != nil {
		logger.Error("Failed to record LLM metrics",
			zap.String("api_name", apiName),
			zap.String("model", tokenUsage.Model),
			zap.Error(err),
		)
	} else {
		logger.Info("Recorded LLM token usage",
			zap.String("api_name", apiName),
			zap.String("model", tokenUsage.Model),
			zap.Int64("input_tokens", tokenUsage.InputTokens),
			zap.Int64("output_tokens", tokenUsage.OutputTokens),
			zap.Int("cost_cents", costCents),
		)
	}
}

// calculateTokenCost calculates the cost in cents for the given token usage
func (p *ProxyService) calculateTokenCost(ctx context.Context, provider, model string, inputTokens, outputTokens int64) (int, error) {
	// Query pricing from database
	query := `
		SELECT input_price_per_million, output_price_per_million
		FROM model_pricing
		WHERE provider = $1 
		  AND model = $2
		  AND deprecated_date IS NULL
		ORDER BY effective_date DESC
		LIMIT 1
	`

	var inputPrice, outputPrice int
	err := p.store.GetDB().QueryRowContext(ctx, query, provider, model).Scan(&inputPrice, &outputPrice)
	if err != nil {
		// Fallback to default pricing if model not found
		logger.Warn("Model pricing not found, using defaults",
			zap.String("provider", provider),
			zap.String("model", model),
			zap.Error(err),
		)
		// Default to GPT-3.5 pricing
		inputPrice = 50   // $0.50 per 1M
		outputPrice = 150 // $1.50 per 1M
	}

	// Calculate cost: (tokens / 1,000,000) * price_per_million
	inputCost := float64(inputTokens) * float64(inputPrice) / 1_000_000.0
	outputCost := float64(outputTokens) * float64(outputPrice) / 1_000_000.0
	totalCostCents := int(inputCost + outputCost)

	return totalCostCents, nil
}

// Health checks if the proxy service is healthy
func (p *ProxyService) Health() bool {
	return p.store.Health()
}

// GetStats returns proxy statistics
func (p *ProxyService) GetStats() map[string]interface{} {
	return p.rateLimiter.GetStats()
}

// GetCircuitBreakerManager returns the circuit breaker manager instance
func (p *ProxyService) GetCircuitBreakerManager() *CircuitBreakerManager {
	return p.circuitBreakers
}

// GetCircuitBreakerStats returns circuit breaker statistics
func (p *ProxyService) GetCircuitBreakerStats() CircuitBreakerStats {
	return p.circuitBreakers.GetStats()
}

// GetCircuitBreakerMetrics returns detailed metrics for all circuit breakers
func (p *ProxyService) GetCircuitBreakerMetrics() map[string]CircuitBreakerMetrics {
	return p.circuitBreakers.GetAllMetrics()
}

// ResetCircuitBreaker resets a specific circuit breaker
func (p *ProxyService) ResetCircuitBreaker(apiID string) error {
	return p.circuitBreakers.Reset(apiID)
}

// ValidateAPIConfig validates an API configuration before creation/update
func (p *ProxyService) ValidateAPIConfig(config *models.APIConfig) error {
	return domaingateway.ValidateAPIConfig(config)
}

// checkMultiTierRateLimits checks all configured rate limit tiers
// Returns (allowed bool, limitType string)
// Uses Redis for distributed rate limiting with fallback to in-memory
func (p *ProxyService) checkMultiTierRateLimits(userID uuid.UUID, apiName string, apiConfig *models.APIConfig) (bool, string) {
	// If Redis limiter is available, use multi-tier distributed rate limiting
	if p.redisLimiter != nil {
		startTime := time.Now()

		limits := &ratelimiter.MultiTierLimits{
			RateLimitPerSecond: apiConfig.RateLimitPerSecond,
			BurstSize:          apiConfig.BurstSize,
			RateLimitPerHour:   apiConfig.RateLimitPerHour,
			RateLimitPerDay:    apiConfig.RateLimitPerDay,
			RateLimitPerMonth:  apiConfig.RateLimitPerMonth,
		}

		allowed, limitType, err := p.redisLimiter.AllowWithMultiTier(userID, apiName, limits)

		// If Redis check succeeded, return result
		if err == nil {
			redisLatency := time.Since(startTime)

			// Track Redis latency (warn if > 5ms)
			if redisLatency > 5*time.Millisecond {
				logger.Warn("High Redis latency for rate limiting",
					zap.Duration("latency", redisLatency),
					zap.String("user_id", userID.String()),
					zap.String("api_name", apiName),
				)
			} else {
				logger.Debug("Redis rate limit check",
					zap.Duration("latency", redisLatency),
					zap.Bool("allowed", allowed),
					zap.String("limit_type", limitType),
				)
			}

			if !allowed {
				logger.Info("Distributed rate limit exceeded",
					zap.String("user_id", userID.String()),
					zap.String("api_name", apiName),
					zap.String("limit_type", limitType),
					zap.Duration("redis_latency", redisLatency),
				)
			}

			return allowed, limitType
		}

		// If Redis failed, log error and fall through to in-memory fallback
		logger.Error("Redis rate limiter failed, falling back to in-memory",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
	}

	// Fallback to in-memory limiter (per-second and burst only)
	// This is used when Redis is unavailable or disabled
	logger.Debug("Using in-memory rate limiter (Redis unavailable)",
		zap.String("user_id", userID.String()),
		zap.String("api_name", apiName),
	)

	if !p.rateLimiter.AllowForUser(userID, apiName, apiConfig.RateLimitPerSecond, apiConfig.BurstSize) {
		logger.Info("In-memory rate limit exceeded",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
		)
		return false, "per-second"
	}

	return true, ""
}

// TrackStreamingMetrics records metrics for streaming requests
// This is called asynchronously after a stream completes
func (p *ProxyService) TrackStreamingMetrics(
	ctx context.Context,
	userID uuid.UUID,
	apiName string,
	statusCode int,
	bytesStreamed int64,
	duration time.Duration,
	streamType string,
) error {
	// Record streaming response metrics
	if err := p.usageTracker.RecordStreamingResponse(
		ctx,
		userID,
		apiName,
		statusCode,
		duration,
		bytesStreamed,
	); err != nil {
		logger.Error("Failed to record streaming metrics",
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		return err
	}

	logger.Debug("Streaming metrics recorded",
		zap.String("user_id", userID.String()),
		zap.String("api_name", apiName),
		zap.Int64("bytes", bytesStreamed),
		zap.Duration("duration", duration),
		zap.String("stream_type", streamType),
	)

	return nil
}

// Shutdown gracefully shuts down the proxy service
// It waits for in-flight requests to complete with a timeout
func (p *ProxyService) Shutdown(ctx context.Context) error {
	logger.Info("Shutting down proxy service...")

	// Note: In-flight HTTP requests are handled by Fiber's ShutdownWithContext
	// This method can be extended to drain any internal queues or connections

	// Close HTTP client's idle connections
	if transport, ok := p.httpClient.Transport.(*http.Transport); ok {
		transport.CloseIdleConnections()
		logger.Info("Closed idle HTTP connections")
	}

	logger.Info("Proxy service shutdown complete")
	return nil
}
