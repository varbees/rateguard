package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// WebhookWorkerConfig holds configuration for webhook worker
type WebhookWorkerConfig struct {
	WorkerCount         int           // Number of concurrent workers
	PollInterval        time.Duration // How often to check for pending webhooks
	DeliveryTimeout     time.Duration // HTTP timeout for webhook delivery
	MaxRetries          int           // Maximum retry attempts
	BaseRetryDelay      time.Duration // Initial retry delay (exponential backoff)
	MaxRetryDelay       time.Duration // Maximum retry delay
	MaxResponseBodySize int           // Maximum response body to store (bytes)
}

// DefaultWebhookWorkerConfig returns default configuration
func DefaultWebhookWorkerConfig() WebhookWorkerConfig {
	return WebhookWorkerConfig{
		WorkerCount:         5,
		PollInterval:        5 * time.Second,
		DeliveryTimeout:     30 * time.Second,
		MaxRetries:          5,
		BaseRetryDelay:      5 * time.Second,
		MaxRetryDelay:       5 * time.Minute,
		MaxResponseBodySize: 10 * 1024, // 10 KB
	}
}

// WebhookWorker handles webhook delivery with retry logic
type WebhookWorker struct {
	config           WebhookWorkerConfig
	store            *storage.PostgresStore
	circuitBreakers  *proxy.CircuitBreakerManager
	httpClient       *http.Client
	stopChan         chan struct{}
	wg               sync.WaitGroup
	
	// Metrics
	deliveryAttempts int64
	successfulDeliveries int64
	failedDeliveries int64
	mu sync.RWMutex
}

// NewWebhookWorker creates a new webhook worker
func NewWebhookWorker(
	config WebhookWorkerConfig,
	store *storage.PostgresStore,
	circuitBreakers *proxy.CircuitBreakerManager,
) *WebhookWorker {
	// Create HTTP client with timeout
	httpClient := &http.Client{
		Timeout: config.DeliveryTimeout,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	return &WebhookWorker{
		config:          config,
		store:           store,
		circuitBreakers: circuitBreakers,
		httpClient:      httpClient,
		stopChan:        make(chan struct{}),
	}
}

// Start begins the webhook worker processes
func (w *WebhookWorker) Start(ctx context.Context) {
	logger.Info("Starting webhook workers",
		zap.Int("worker_count", w.config.WorkerCount),
		zap.Duration("poll_interval", w.config.PollInterval),
	)

	// Start worker goroutines
	for i := 0; i < w.config.WorkerCount; i++ {
		w.wg.Add(1)
		go w.worker(ctx, i)
	}

	logger.Info("✅ Webhook workers started")
}

// Stop gracefully stops all webhook workers
func (w *WebhookWorker) Stop(ctx context.Context) error {
	logger.Info("Stopping webhook workers...")
	close(w.stopChan)
	
	// Wait for workers to finish with timeout
	done := make(chan struct{})
	go func() {
		w.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		logger.Info("✅ All webhook workers stopped gracefully")
		return nil
	case <-ctx.Done():
		logger.Warn("Webhook worker shutdown timed out")
		return ctx.Err()
	}
}

// worker is the main worker goroutine
func (w *WebhookWorker) worker(ctx context.Context, workerID int) {
	defer w.wg.Done()

	logger.Debug("Webhook worker started", zap.Int("worker_id", workerID))
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopChan:
			logger.Debug("Webhook worker stopping", zap.Int("worker_id", workerID))
			return
		case <-ctx.Done():
			logger.Debug("Webhook worker context cancelled", zap.Int("worker_id", workerID))
			return
		case <-ticker.C:
			w.processPendingWebhooks(ctx, workerID)
		}
	}
}

// processPendingWebhooks fetches and processes pending webhooks
func (w *WebhookWorker) processPendingWebhooks(ctx context.Context, workerID int) {
	// Fetch pending webhooks (limit per poll to avoid overload)
	batchSize := 10
	events, err := w.store.GetPendingWebhookEvents(ctx, batchSize)
	if err != nil {
		logger.Error("Failed to fetch pending webhooks",
			zap.Int("worker_id", workerID),
			zap.Error(err),
		)
		return
	}

	if len(events) == 0 {
		return
	}

	logger.Debug("Processing pending webhooks",
		zap.Int("worker_id", workerID),
		zap.Int("count", len(events)),
	)

	for _, event := range events {
		// Mark as processing to prevent other workers from picking it up
		if err := w.store.MarkWebhookEventProcessing(ctx, event.ID); err != nil {
			logger.Warn("Failed to mark webhook as processing",
				zap.String("event_id", event.ID.String()),
				zap.Error(err),
			)
			continue
		}

		// Attempt delivery
		w.deliverWebhook(ctx, &event)
	}
}

// deliverWebhook attempts to deliver a single webhook
func (w *WebhookWorker) deliverWebhook(ctx context.Context, event *models.WebhookEvent) {
	startTime := time.Now()
	attemptNumber := event.Retries + 1

	logger.Info("Attempting webhook delivery",
		zap.String("event_id", event.ID.String()),
		zap.String("target_url", event.TargetURL),
		zap.Int("attempt", attemptNumber),
		zap.Int("max_retries", event.MaxRetries),
	)

	// Get or create circuit breaker for target URL domain
	cbID := fmt.Sprintf("webhook-%s", uuid.New().String()[:8])
	circuitBreaker := w.circuitBreakers.GetOrCreate(cbID, event.TargetURL, event.UserID.String())

	var attempt models.WebhookDeliveryAttempt
	attempt.EventID = event.ID
	attempt.AttemptNumber = attemptNumber
	attempt.AttemptedAt = startTime

	// Execute delivery with circuit breaker protection
	err := circuitBreaker.Call(func() error {
		return w.executeDelivery(ctx, event, &attempt)
	})

	attempt.DurationMs = time.Since(startTime).Milliseconds()

	// Handle circuit breaker errors
	if err != nil {
		if err == proxy.ErrCircuitOpen {
			logger.Warn("Circuit breaker open for webhook target",
				zap.String("event_id", event.ID.String()),
				zap.String("target_url", event.TargetURL),
			)
			errMsg := fmt.Sprintf("Circuit breaker open: %v", err)
			attempt.Error = &errMsg
			attempt.Success = false
		} else {
			// Actual delivery error
			if attempt.Error == nil {
				errMsg := err.Error()
				attempt.Error = &errMsg
			}
			attempt.Success = false
		}
	}

	// Calculate next retry if needed
	if !attempt.Success && attemptNumber < event.MaxRetries {
		nextRetry := models.CalculateNextRetry(
			attemptNumber,
			w.config.BaseRetryDelay,
			w.config.MaxRetryDelay,
		)
		attempt.NextRetryAt = &nextRetry

		logger.Info("Webhook delivery failed, will retry",
			zap.String("event_id", event.ID.String()),
			zap.Time("next_retry_at", nextRetry),
			zap.Duration("retry_delay", time.Until(nextRetry)),
		)
	}

	// Update database with attempt result
	if err := w.store.UpdateWebhookEventDelivery(ctx, event.ID, &attempt); err != nil {
		logger.Error("Failed to update webhook delivery status",
			zap.String("event_id", event.ID.String()),
			zap.Error(err),
		)
		return
	}

	// Update metrics
	w.mu.Lock()
	w.deliveryAttempts++
	if attempt.Success {
		w.successfulDeliveries++
	} else {
		w.failedDeliveries++
	}
	w.mu.Unlock()
}

// executeDelivery performs the actual HTTP POST delivery
func (w *WebhookWorker) executeDelivery(ctx context.Context, event *models.WebhookEvent, attempt *models.WebhookDeliveryAttempt) error {
	// Serialize payload
	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("failed to serialize payload: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", event.TargetURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "RateGuard-Webhook-Relay/1.0")
	req.Header.Set("X-Webhook-Event-ID", event.ID.String())
	req.Header.Set("X-Webhook-Source", event.Source)
	req.Header.Set("X-Webhook-Event-Type", event.EventType)
	req.Header.Set("X-Webhook-Attempt", fmt.Sprint(attempt.AttemptNumber))

	// Add original headers if any (for signature verification)
	for key, value := range event.Headers {
		if key != "" && value != "" {
			req.Header.Set(key, value)
		}
	}

	// Execute request
	resp, err := w.httpClient.Do(req)
	if err != nil {
		errMsg := fmt.Sprintf("HTTP request failed: %v", err)
		attempt.Error = &errMsg
		return fmt.Errorf("delivery failed: %w", err)
	}
	defer resp.Body.Close()

	// Record status code
	attempt.StatusCode = &resp.StatusCode

	// Read response body (limited size)
	bodyReader := io.LimitReader(resp.Body, int64(w.config.MaxResponseBodySize))
	responseBody, err := io.ReadAll(bodyReader)
	if err != nil {
		logger.Warn("Failed to read response body",
			zap.String("event_id", event.ID.String()),
			zap.Error(err),
		)
	} else if len(responseBody) > 0 {
		bodyStr := string(responseBody)
		attempt.ResponseBody = &bodyStr
	}

	// Check if delivery was successful
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		attempt.Success = true
		logger.Info("Webhook delivered successfully",
			zap.String("event_id", event.ID.String()),
			zap.String("target_url", event.TargetURL),
			zap.Int("status_code", resp.StatusCode),
			zap.Int64("duration_ms", attempt.DurationMs),
		)
		return nil
	}

	// Check if we should retry based on status code
	shouldRetry := models.ShouldRetry(resp.StatusCode)
	errMsg := fmt.Sprintf("Delivery failed with status %d (retry: %v)", resp.StatusCode, shouldRetry)
	attempt.Error = &errMsg

	if shouldRetry {
		return fmt.Errorf("delivery failed with status %d (retry: %v)", resp.StatusCode, shouldRetry)
	}

	// Don't retry on 4xx errors (except specific cases handled by ShouldRetry)
	logger.Warn("Webhook delivery failed with non-retryable error",
		zap.String("event_id", event.ID.String()),
		zap.Int("status_code", resp.StatusCode),
	)

	return fmt.Errorf("delivery failed with status %d (no retry)", resp.StatusCode)
}

// GetMetrics returns current worker metrics
func (w *WebhookWorker) GetMetrics() map[string]interface{} {
	w.mu.RLock()
	defer w.mu.RUnlock()

	return map[string]interface{}{
		"delivery_attempts":      w.deliveryAttempts,
		"successful_deliveries":  w.successfulDeliveries,
		"failed_deliveries":      w.failedDeliveries,
		"worker_count":           w.config.WorkerCount,
		"poll_interval_seconds":  w.config.PollInterval.Seconds(),
	}
}

// Health checks if webhook worker is healthy
func (w *WebhookWorker) Health() bool {
	// Simple health check - could be enhanced
	return true
}
