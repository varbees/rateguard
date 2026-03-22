package proxy

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	httpadapter "github.com/varbees/rateguard/internal/adapters/http"
	domaingateway "github.com/varbees/rateguard/internal/domain/gateway"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// ProxyRequestWithQueue handles a proxied API call with intelligent queuing
// If rate limit is hit, it queues the request and waits instead of rejecting
func (p *ProxyService) ProxyRequestWithQueue(ctx context.Context, req *models.ProxyRequest) (*models.ProxyResponse, error) {
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

	admission := p.admitQueuedRequest(ctx, req, apiConfig, startTime)
	if admission.blocked != nil {
		return admission.blocked, admission.err
	}
	if admission.err != nil {
		return nil, admission.err
	}

	response.Queued = admission.queued
	response.QueueDuration = admission.queueDuration

	// Record request for billing/analytics
	if err := p.usageTracker.RecordRequest(ctx, req.UserID, req.TargetAPI); err != nil {
		logger.Error("Failed to record usage", zap.Error(err))
		// Don't fail the request if tracking fails
	}

	// Build target URL (with path if provided)
	targetURL := domaingateway.BuildTargetURLWithPath(apiConfig.TargetURL, req.Path, req.QueryParams)

	// Build target request
	var bodyReader io.Reader
	if len(req.Body) > 0 {
		bodyReader = bytes.NewReader(req.Body)
	}
	targetReq, err := http.NewRequestWithContext(ctx, req.Method, targetURL, bodyReader)
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

	// Get or create circuit breaker for this API
	circuitBreaker := p.circuitBreakers.GetOrCreate(apiConfig.ID.String(), apiConfig.Name, apiConfig.UserID.String())

	// Execute request with retry logic, 429 handling, and circuit breaker protection
	var resp *http.Response
	err = circuitBreaker.Call(func() error {
		var retryErr error
		resp, retryErr = httpadapter.DoWithRetryAndBackoff(p.httpClient, targetReq, apiConfig.RetryAttempts, req.UserID.String(), req.TargetAPI)

		if retryErr != nil {
			return retryErr
		}

		// Check if response indicates upstream API failure (5xx errors)
		if resp != nil && resp.StatusCode >= 500 {
			return fmt.Errorf("upstream API returned %d", resp.StatusCode)
		}

		return nil
	})
	duration := time.Since(startTime)

	// Observe rate limit headers (on success or 429 responses)
	if resp != nil && (resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable) {
		p.recordRateLimitObservationAsync(apiConfig, resp)
	}

	if err != nil {
		// Handle circuit breaker open error
		if err == ErrCircuitOpen {
			logger.Warn("Circuit breaker is OPEN, failing fast",
				zap.String("user_id", req.UserID.String()),
				zap.String("target_api", req.TargetAPI),
			)
			response = buildProxyCircuitOpenResponse(req.ID, startTime, duration, err)
			return response, nil // Return response with 503, not error, so handler sends it
		}

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

	// Check if response is streaming
	contentType := resp.Header.Get("Content-Type")
	if httpadapter.IsStreamingResponse(contentType, resp.Header) {
		// Streaming response: Don't buffer, pass through the body
		streamType := httpadapter.DetectStreamType(contentType, resp.Header)

		logger.Info("Detected streaming response",
			zap.String("user_id", req.UserID.String()),
			zap.String("target_api", req.TargetAPI),
			zap.String("stream_type", streamType),
			zap.Bool("queued", admission.queued),
		)

		// Build streaming response (body not buffered)
		response = buildProxyStreamingResponse(response, resp.StatusCode, resp.Header, duration, streamType)
		response.RawBody = resp.Body // Pass through without buffering

		// Note: Don't close resp.Body here - it will be streamed to client
		// Note: Don't record usage yet - will be recorded after stream completes

		return response, nil
	}

	// Non-streaming response: Buffer as before
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

	// Record successful response
	p.usageTracker.RecordResponse(ctx, req.UserID, req.TargetAPI, resp.StatusCode, duration)

	logger.Info("Proxy request completed",
		zap.String("user_id", req.UserID.String()),
		zap.String("target_api", req.TargetAPI),
		zap.Int("status", resp.StatusCode),
		zap.Duration("duration", duration),
		zap.Bool("queued", admission.queued),
	)

	return response, nil
}
