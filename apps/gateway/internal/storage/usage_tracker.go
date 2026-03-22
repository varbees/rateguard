package storage

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/queue"
	"github.com/varbees/rateguard/internal/websocket"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// MetricsBuffer holds aggregated metrics for a short period
type MetricsBuffer struct {
	mu      sync.Mutex
	metrics map[string]*models.StreamingStats // Key: userID
}

// UsageTracker tracks API usage for billing and analytics
type UsageTracker struct {
	db          *sql.DB
	hub         *websocket.Hub
	buffer      *MetricsBuffer
	eventQueue  queue.EventQueue  // Optional: if nil, falls back to sync DB writes
	usageBuffer *RedisUsageBuffer // Optional: for async DB writes
}

// NewUsageTracker creates a new usage tracker
func NewUsageTracker(db *sql.DB, hub *websocket.Hub) *UsageTracker {
	return &UsageTracker{
		db:  db,
		hub: hub,
		buffer: &MetricsBuffer{
			metrics: make(map[string]*models.StreamingStats),
		},
		eventQueue:  nil,
		usageBuffer: nil,
	}
}

// SetEventQueue sets the event queue for async analytics processing
func (u *UsageTracker) SetEventQueue(eq queue.EventQueue) {
	u.eventQueue = eq
	logger.Info("Event queue enabled for analytics")
}

// SetUsageBuffer sets the Redis usage buffer for async usage tracking
func (u *UsageTracker) SetUsageBuffer(ub *RedisUsageBuffer) {
	u.usageBuffer = ub
	logger.Info("Redis usage buffer enabled for async tracking")
}

// StartMetricsPublisher starts a background goroutine to publish buffered metrics
func (u *UsageTracker) StartMetricsPublisher(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				u.publishBufferedMetrics()
			}
		}
	}()
}

// publishBufferedMetrics flushes the buffer and sends updates via WebSocket
func (u *UsageTracker) publishBufferedMetrics() {
	u.buffer.mu.Lock()
	if len(u.buffer.metrics) == 0 {
		u.buffer.mu.Unlock()
		return
	}

	// Create a snapshot of current metrics to publish
	snapshot := make(map[string]*models.StreamingStats)
	for userID, stats := range u.buffer.metrics {
		// Clone stats to avoid race conditions if we were keeping them
		// But here we're just sending them.
		// For cumulative stats, we might want to keep them in memory or fetch fresh from DB.
		// For "live" throughput, we reset the counter.
		// However, the frontend expects "total" stats usually.
		// Let's fetch the latest cumulative stats from DB for these users to ensure accuracy
		// OR just send what we have if we want purely "live" updates.
		// The requirement is "Streaming Analytics", which usually implies "what's happening now" + totals.

		// Let's send the incremental updates for now, or fetch totals.
		// Fetching totals for every user every second might be heavy on DB.
		// Better approach: The buffer accumulates "new" events.
		// We send these new events to the frontend, which updates its local total.
		// OR we send the new total.

		// Let's stick to the plan: "metrics.update" event.
		// We'll send the latest snapshot of "totals" if possible, or just the delta.
		// Given the frontend "StreamingMetrics" likely shows totals, let's try to send totals.
		// But calculating totals every second is expensive.

		// Alternative: The buffer holds the "latest" state if we update it cumulatively in memory?
		// No, multiple instances.

		// Let's send the DELTA (requests in last second) and let frontend/hub handle it?
		// The Hub.PublishMetricsUpdate takes a map[string]interface{}.

		// Let's send the aggregated stats for the last second (throughput, avg latency).
		// And maybe the total count if we have it cached.

		// For Phase 2, let's send the *incremental* stats for the last second.
		// The frontend can add them to its running total?
		// Or better: The frontend fetches a snapshot on connect, then listens for updates.
		// If we send "requests: 5", the frontend adds 5.

		snapshot[userID] = stats
	}

	// Reset buffer for next interval (if we are sending deltas)
	// If we want to send "current rate", we reset.
	u.buffer.metrics = make(map[string]*models.StreamingStats)
	u.buffer.mu.Unlock()

	for userIDStr, stats := range snapshot {
		// Convert to map for JSON
		data := map[string]interface{}{
			"requests":    stats.TotalRequests, // This is actually requests in last interval
			"bytes":       stats.TotalBytes,
			"avg_latency": stats.AvgLatency,
			"error_count": stats.ErrorCount,
			"timestamp":   time.Now().UnixMilli(),
		}

		if u.hub != nil {
			if err := u.hub.PublishMetricsUpdate(userIDStr, data); err != nil {
				logger.Error("Failed to publish metrics update", zap.Error(err))
			}
		}
	}
}

// GetActiveStreamCount returns the current number of live streaming clients for a user.
func (u *UsageTracker) GetActiveStreamCount(userID uuid.UUID) int {
	if u == nil || u.hub == nil {
		return 0
	}

	return u.hub.ActiveClientCountForUser(userID.String())
}

// BufferMetrics adds a request to the buffer
func (u *UsageTracker) BufferMetrics(userID uuid.UUID, latency time.Duration, bytes int64, isError bool) {
	u.buffer.mu.Lock()
	defer u.buffer.mu.Unlock()

	stats, ok := u.buffer.metrics[userID.String()]
	if !ok {
		stats = &models.StreamingStats{}
		u.buffer.metrics[userID.String()] = stats
	}

	stats.TotalRequests++
	stats.TotalBytes += bytes
	if isError {
		stats.ErrorCount++
	}

	// Recalculate average latency
	// NewAvg = (OldAvg * (Count-1) + NewVal) / Count
	totalLatency := (float64(stats.AvgLatency) * float64(stats.TotalRequests-1)) + float64(latency.Milliseconds())
	stats.AvgLatency = totalLatency / float64(stats.TotalRequests)
}

// RecordRequest increments usage counter (daily aggregation)
func (u *UsageTracker) RecordRequest(ctx context.Context, userID uuid.UUID, targetAPI string) error {
	now := time.Now()

	// 1. If Redis usage buffer is available, use it (Async - High Performance)
	if u.usageBuffer != nil {
		if err := u.usageBuffer.BufferRequest(ctx, userID, targetAPI); err != nil {
			// Log error but fall through to other methods (fail-safe)
			logger.Error("Failed to buffer request in Redis", zap.Error(err))
		} else {
			// Successfully buffered
			return nil
		}
	}

	// 2. If event queue is available, publish event asynchronously (Async - Event Driven)
	if u.eventQueue != nil {
		event := &queue.Event{
			ID:        uuid.New().String(),
			Type:      queue.EventTypeRequest,
			UserID:    userID,
			Timestamp: now,
			Data: queue.EventData{
				TargetAPI: targetAPI,
			},
		}

		if err := u.eventQueue.Publish(ctx, event); err != nil {
			logger.Error("Failed to publish request event, falling back to sync write",
				zap.String("user_id", userID.String()),
				zap.String("target_api", targetAPI),
				zap.Error(err),
			)
			// Fall through to sync write on error
		} else {
			// Successfully published to queue
			return nil
		}
	}

	// 3. Fallback: synchronous DB write (original behavior)
	usageDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	query := `
		INSERT INTO api_usage (user_id, target_api, requests, usage_date, timestamp)
		VALUES ($1, $2, 1, $3, $4)
		ON CONFLICT (user_id, target_api, usage_date)
		DO UPDATE SET 
			requests = api_usage.requests + 1,
			timestamp = $4
	`

	_, err := u.db.ExecContext(ctx, query, userID, targetAPI, usageDate, now)
	if err != nil {
		logger.Error("Failed to record usage",
			zap.String("user_id", userID.String()),
			zap.String("target_api", targetAPI),
			zap.Error(err),
		)
		return fmt.Errorf("failed to record request: %w", err)
	}

	return nil
}

// RecordResponse tracks response metrics
func (u *UsageTracker) RecordResponse(ctx context.Context, userID uuid.UUID, targetAPI string, statusCode int, duration time.Duration) error {
	// Buffer metrics for real-time updates (WebSocket)
	isError := statusCode >= 400
	u.BufferMetrics(userID, duration, 0, isError)

	// If event queue is available, publish event asynchronously
	if u.eventQueue != nil {
		event := &queue.Event{
			ID:        uuid.New().String(),
			Type:      queue.EventTypeResponse,
			UserID:    userID,
			Timestamp: time.Now(),
			Data: queue.EventData{
				TargetAPI:  targetAPI,
				StatusCode: statusCode,
				DurationMs: duration.Milliseconds(),
			},
		}

		if err := u.eventQueue.Publish(ctx, event); err != nil {
			logger.Error("Failed to publish response event, falling back to sync write",
				zap.String("user_id", userID.String()),
				zap.String("target_api", targetAPI),
				zap.Error(err),
			)
			// Fall through to sync write on error
		} else {
			// Successfully published to queue
			return nil
		}
	}

	// Fallback: synchronous DB write (original behavior)
	query := `
		INSERT INTO api_metrics (user_id, target_api, status_code, duration_ms, timestamp)
		VALUES ($1, $2, $3, $4, $5)
	`

	_, err := u.db.ExecContext(ctx, query, userID, targetAPI, statusCode, duration.Milliseconds(), time.Now())
	if err != nil {
		logger.Error("Failed to record metrics",
			zap.String("user_id", userID.String()),
			zap.String("target_api", targetAPI),
			zap.Error(err),
		)
		return fmt.Errorf("failed to record response: %w", err)
	}

	return nil
}

// RecordLLMResponse tracks LLM-specific metrics including tokens and costs
// This is called for LLM API requests after token extraction
func (u *UsageTracker) RecordLLMResponse(
	ctx context.Context,
	userID uuid.UUID,
	targetAPI string,
	model string,
	inputTokens, outputTokens int64,
	estimatedCostCents int,
	statusCode int,
	duration time.Duration,
) error {
	// Buffer metrics for real-time updates
	isError := statusCode >= 400
	u.BufferMetrics(userID, duration, 0, isError)

	totalTokens := inputTokens + outputTokens

	// If event queue is available, publish event asynchronously
	if u.eventQueue != nil {
		event := &queue.Event{
			ID:        uuid.New().String(),
			Type:      queue.EventTypeLLM,
			UserID:    userID,
			Timestamp: time.Now(),
			Data: queue.EventData{
				TargetAPI:    targetAPI,
				StatusCode:   statusCode,
				DurationMs:   duration.Milliseconds(),
				Model:        model,
				InputTokens:  inputTokens,
				OutputTokens: outputTokens,
				TotalTokens:  totalTokens,
				CostCents:    estimatedCostCents,
			},
		}

		if err := u.eventQueue.Publish(ctx, event); err != nil {
			logger.Error("Failed to publish LLM event, falling back to sync write",
				zap.String("user_id", userID.String()),
				zap.String("target_api", targetAPI),
				zap.Error(err),
			)
			// Fall through to sync write on error
		} else {
			// Successfully published to queue
			return nil
		}
	}

	// Fallback: synchronous DB write (original behavior)

	// Insert into api_metrics with token data
	query := `
		INSERT INTO api_metrics (
			user_id, target_api, model_used,
			input_tokens, output_tokens, total_tokens,
			estimated_cost_cents, status_code, duration_ms, timestamp
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	_, err := u.db.ExecContext(
		ctx, query,
		userID, targetAPI, model,
		inputTokens, outputTokens, totalTokens,
		estimatedCostCents, statusCode, duration.Milliseconds(), time.Now(),
	)

	if err != nil {
		logger.Error("Failed to record LLM metrics",
			zap.String("user_id", userID.String()),
			zap.String("target_api", targetAPI),
			zap.String("model", model),
			zap.Error(err),
		)
		return fmt.Errorf("failed to record LLM response: %w", err)
	}

	// Update daily aggregation in api_usage (include both requests AND tokens)
	now := time.Now()
	usageDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	updateQuery := `
		INSERT INTO api_usage (user_id, target_api, requests, total_tokens, total_cost_cents, usage_date, timestamp)
		VALUES ($1, $2, 1, $3, $4, $5, $6)
		ON CONFLICT (user_id, target_api, usage_date)
		DO UPDATE SET
			requests = api_usage.requests + 1,
			total_tokens = api_usage.total_tokens + $3,
			total_cost_cents = api_usage.total_cost_cents + $4,
			timestamp = $6
	`

	_, err = u.db.ExecContext(ctx, updateQuery, userID, targetAPI, totalTokens, estimatedCostCents, usageDate, now)
	if err != nil {
		logger.Error("Failed to update LLM usage aggregation",
			zap.String("user_id", userID.String()),
			zap.String("target_api", targetAPI),
			zap.Error(err),
		)
		return fmt.Errorf("failed to update LLM usage: %w", err)
	}

	return nil
}

// GetMonthlyTokenUsage returns token usage summary for current month
func (u *UsageTracker) GetMonthlyTokenUsage(ctx context.Context, userID uuid.UUID) (*models.TokenUsageSummary, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	query := `
		SELECT 
			COALESCE(model_used, 'unknown') as model,
			SUM(input_tokens) as input,
			SUM(output_tokens) as output,
			SUM(total_tokens) as total,
			SUM(estimated_cost_cents) as cost_cents,
			COUNT(*) as requests
		FROM api_metrics
		WHERE user_id = $1 
		  AND timestamp >= $2
		  AND total_tokens > 0
		GROUP BY model_used
	`

	rows, err := u.db.QueryContext(ctx, query, userID, monthStart)
	if err != nil {
		return nil, fmt.Errorf("failed to query token usage: %w", err)
	}
	defer rows.Close()

	byModel := make(map[string]*models.ModelUsage)
	var totalInputTokens, totalOutputTokens, totalTokens int64
	var totalCostCents int

	for rows.Next() {
		var model string
		var input, output, total, requests int64
		var costCents int

		if err := rows.Scan(&model, &input, &output, &total, &costCents, &requests); err != nil {
			logger.Error("Failed to scan token usage row", zap.Error(err))
			continue
		}

		byModel[model] = &models.ModelUsage{
			Model:     model,
			Tokens:    total,
			Requests:  requests,
			CostCents: costCents,
			CostUSD:   float64(costCents) / 100.0,
		}

		totalInputTokens += input
		totalOutputTokens += output
		totalTokens += total
		totalCostCents += costCents
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating token usage rows: %w", err)
	}

	return &models.TokenUsageSummary{
		UserID:         userID,
		TotalTokens:    totalTokens,
		InputTokens:    totalInputTokens,
		OutputTokens:   totalOutputTokens,
		TotalCostCents: totalCostCents,
		TotalCostUSD:   float64(totalCostCents) / 100.0,
		ByModel:        byModel,
		Period:         "month",
		CalculatedAt:   time.Now(),
	}, nil
}

// GetUsage retrieves usage stats for a time period
func (u *UsageTracker) GetUsage(ctx context.Context, userID uuid.UUID, start, end time.Time) (*models.UsageStats, error) {
	query := `
		SELECT 
			COALESCE(SUM(u.requests), 0) as total_requests,
			COUNT(DISTINCT u.target_api) as apis_used,
			COALESCE(AVG(m.duration_ms), 0) as avg_duration_ms,
			COALESCE(
				100.0 * SUM(CASE WHEN m.status_code >= 200 AND m.status_code < 300 THEN 1 ELSE 0 END) / 
				NULLIF(COUNT(m.id), 0), 
				0
			) as success_rate,
			COALESCE(
				100.0 * SUM(CASE WHEN m.status_code >= 400 THEN 1 ELSE 0 END) / 
				NULLIF(COUNT(m.id), 0), 
				0
			) as error_rate
		FROM api_usage u
		LEFT JOIN api_metrics m ON m.user_id = u.user_id AND m.target_api = u.target_api 
			AND m.timestamp BETWEEN $2 AND $3
		WHERE u.user_id = $1 AND u.usage_date BETWEEN DATE($2) AND DATE($3)
	`

	var stats models.UsageStats
	stats.UserID = userID
	stats.PeriodStart = start
	stats.PeriodEnd = end

	err := u.db.QueryRowContext(ctx, query, userID, start, end).Scan(
		&stats.TotalRequests,
		&stats.APIsUsed,
		&stats.AvgDurationMs,
		&stats.SuccessRate,
		&stats.ErrorRate,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get usage: %w", err)
	}

	// Determine period type
	duration := end.Sub(start)
	if duration <= 24*time.Hour {
		stats.Period = "daily"
	} else if duration <= 7*24*time.Hour {
		stats.Period = "weekly"
	} else {
		stats.Period = "monthly"
	}

	return &stats, nil
}

// GetUsageByAPI retrieves usage breakdown by API
func (u *UsageTracker) GetUsageByAPI(ctx context.Context, userID uuid.UUID, start, end time.Time) ([]models.UsageByAPI, error) {
	query := `
		SELECT 
			u.target_api as api_name,
			SUM(u.requests) as requests,
			COALESCE(AVG(m.duration_ms), 0) as avg_duration_ms,
			COALESCE(
				100.0 * SUM(CASE WHEN m.status_code >= 200 AND m.status_code < 300 THEN 1 ELSE 0 END) / 
				NULLIF(COUNT(m.id), 0), 
				0
			) as success_rate,
			COALESCE(
				100.0 * SUM(CASE WHEN m.status_code >= 400 THEN 1 ELSE 0 END) / 
				NULLIF(COUNT(m.id), 0), 
				0
			) as error_rate,
			MAX(u.timestamp) as last_used
		FROM api_usage u
		LEFT JOIN api_metrics m ON m.user_id = u.user_id AND m.target_api = u.target_api 
			AND m.timestamp BETWEEN $2 AND $3
		WHERE u.user_id = $1 AND u.usage_date BETWEEN DATE($2) AND DATE($3)
		GROUP BY u.target_api
		ORDER BY requests DESC
	`

	rows, err := u.db.QueryContext(ctx, query, userID, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to get usage by API: %w", err)
	}
	defer rows.Close()

	var results []models.UsageByAPI
	for rows.Next() {
		var usage models.UsageByAPI
		err := rows.Scan(
			&usage.APIName,
			&usage.Requests,
			&usage.AvgDurationMs,
			&usage.SuccessRate,
			&usage.ErrorRate,
			&usage.LastUsed,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan usage by API: %w", err)
		}
		results = append(results, usage)
	}

	return results, nil
}

// GetDashboardStats retrieves comprehensive dashboard statistics
func (u *UsageTracker) GetDashboardStats(ctx context.Context, userID uuid.UUID) (*models.DashboardStats, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	var stats models.DashboardStats
	stats.Timestamp = now

	// Get total and today's requests
	query := `
		SELECT 
			COALESCE(SUM(CASE WHEN usage_date >= $2 THEN requests ELSE 0 END), 0) as requests_today,
			COALESCE(SUM(CASE WHEN usage_date >= $3 THEN requests ELSE 0 END), 0) as monthly_usage
		FROM api_usage
		WHERE user_id = $1
	`

	err := u.db.QueryRowContext(ctx, query, userID, todayStart.Format("2006-01-02"), monthStart.Format("2006-01-02")).Scan(
		&stats.RequestsToday,
		&stats.MonthlyUsage,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get request counts: %w", err)
	}

	stats.TotalRequests = stats.MonthlyUsage // For now, use monthly as total

	// Get active APIs count
	query = `
		SELECT COUNT(DISTINCT id)
		FROM api_configs
		WHERE user_id = $1 AND enabled = true
	`

	err = u.db.QueryRowContext(ctx, query, userID).Scan(&stats.ActiveAPIs)
	if err != nil {
		return nil, fmt.Errorf("failed to get active APIs: %w", err)
	}

	// Get average response time and success rate
	query = `
		SELECT 
			COALESCE(AVG(duration_ms), 0) as avg_duration,
			COALESCE(
				100.0 * SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) / 
				NULLIF(COUNT(*), 0), 
				0
			) as success_rate
		FROM api_metrics
		WHERE user_id = $1 AND timestamp >= $2
	`

	err = u.db.QueryRowContext(ctx, query, userID, monthStart).Scan(
		&stats.AvgResponseTimeMs,
		&stats.SuccessRate,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get metrics: %w", err)
	}

	// Get usage by API (top 5)
	usageByAPI, err := u.GetUsageByAPI(ctx, userID, monthStart, now)
	if err != nil {
		return nil, fmt.Errorf("failed to get usage by API: %w", err)
	}

	// Limit to top 5
	if len(usageByAPI) > 5 {
		stats.UsageByAPI = usageByAPI[:5]
	} else {
		stats.UsageByAPI = usageByAPI
	}

	// Calculate usage percentages
	if err := u.calculateUsagePercentages(ctx, userID, &stats); err != nil {
		// Log error but don't fail the request - return 0 percentages
		logger.Error("Failed to calculate usage percentages",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		stats.UsagePercentages.Daily = 0
		stats.UsagePercentages.Monthly = 0
	}

	return &stats, nil
}

// GetMonthlyUsage returns total requests for the current month
func (u *UsageTracker) GetMonthlyUsage(ctx context.Context, userID uuid.UUID) (int64, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	query := `
		SELECT COALESCE(SUM(requests), 0)
		FROM api_usage
		WHERE user_id = $1 AND usage_date >= DATE($2)
	`

	var total int64
	err := u.db.QueryRowContext(ctx, query, userID, monthStart).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("failed to get monthly usage: %w", err)
	}

	return total, nil
}

// RecordStreamingResponse tracks metrics for streaming responses
// Includes bytes streamed and stream duration for billing
func (u *UsageTracker) RecordStreamingResponse(
	ctx context.Context,
	userID uuid.UUID,
	targetAPI string,
	statusCode int,
	duration time.Duration,
	bytesStreamed int64,
) error {
	// First, record the request count
	if err := u.RecordRequest(ctx, userID, targetAPI); err != nil {
		return fmt.Errorf("failed to record streaming request: %w", err)
	}

	// Record streaming metrics to api_metrics table
	// Note: This assumes the migration has been run to add streaming columns
	// If columns don't exist, this will still work but won't store streaming-specific data
	query := `
		INSERT INTO api_metrics (
			user_id, target_api, status_code, duration_ms, timestamp,
			is_streaming, bytes_streamed, stream_duration_ms
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	_, err := u.db.ExecContext(
		ctx,
		query,
		userID,
		targetAPI,
		statusCode,
		duration.Milliseconds(),
		time.Now(),
		true,                    // is_streaming
		bytesStreamed,           // bytes_streamed
		duration.Milliseconds(), // stream_duration_ms
	)

	if err != nil {
		// If the streaming columns don't exist yet, fall back to basic metrics
		logger.Warn("Failed to record streaming metrics, falling back to basic metrics",
			zap.String("user_id", userID.String()),
			zap.String("target_api", targetAPI),
			zap.Error(err),
		)

		// Fall back to standard RecordResponse (without streaming columns)
		return u.RecordResponse(ctx, userID, targetAPI, statusCode, duration)
	}

	logger.Debug("Streaming response metrics recorded",
		zap.String("user_id", userID.String()),
		zap.String("target_api", targetAPI),
		zap.Int("status_code", statusCode),
		zap.Int64("bytes", bytesStreamed),
		zap.Duration("duration", duration),
	)

	// Buffer metrics for real-time updates
	isError := statusCode >= 400
	u.BufferMetrics(userID, duration, bytesStreamed, isError)

	return nil
}

// GetStreamingStats retrieves streaming-specific statistics
// Returns stats only if streaming columns exist in database
func (u *UsageTracker) GetStreamingStats(ctx context.Context, userID uuid.UUID, start, end time.Time) (map[string]interface{}, error) {
	query := `
		SELECT 
			COUNT(*) as total_streams,
			COALESCE(SUM(bytes_streamed), 0) as total_bytes,
			COALESCE(AVG(stream_duration_ms), 0) as avg_stream_duration_ms,
			COALESCE(MAX(stream_duration_ms), 0) as max_stream_duration_ms,
			COALESCE(
				100.0 * SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END)
				/ NULLIF(COUNT(*), 0),
				0
			) as success_rate
		FROM api_metrics
		WHERE user_id = $1 
			AND timestamp BETWEEN $2 AND $3
			AND is_streaming = true
	`

	var totalStreams int64
	var totalBytes int64
	var avgDuration float64
	var maxDuration int64
	var successRate float64

	err := u.db.QueryRowContext(ctx, query, userID, start, end).Scan(
		&totalStreams,
		&totalBytes,
		&avgDuration,
		&maxDuration,
		&successRate,
	)

	if err != nil {
		// Columns might not exist yet
		logger.Debug("Streaming stats query failed (columns may not exist yet)",
			zap.Error(err),
		)
		return map[string]interface{}{
			"total_streams":          0,
			"total_bytes":            0,
			"avg_stream_duration_ms": 0,
			"max_stream_duration_ms": 0,
			"success_rate":           0.0,
			"active_streams":         0,
			"streaming_enabled":      false,
		}, nil
	}

	return map[string]interface{}{
		"total_streams":          totalStreams,
		"total_bytes":            totalBytes,
		"avg_stream_duration_ms": avgDuration,
		"max_stream_duration_ms": maxDuration,
		"success_rate":           successRate,
		"active_streams":         u.GetActiveStreamCount(userID),
		"streaming_enabled":      true,
	}, nil
}

// calculateUsagePercentages calculates daily and monthly usage percentages
func (u *UsageTracker) calculateUsagePercentages(ctx context.Context, userID uuid.UUID, stats *models.DashboardStats) error {
	// Resolve the user's active preset for monthly limit calculations.
	var userPreset string
	query := `SELECT plan FROM users WHERE id = $1`
	err := u.db.QueryRowContext(ctx, query, userID).Scan(&userPreset)
	if err != nil {
		return fmt.Errorf("failed to get user preset: %w", err)
	}

	// Get policy preset limits.
	presetLimits := domainpolicy.GetRateLimits(userPreset)
	stats.MonthlyRequestLimit = presetLimits.MonthlyRequestLimit

	// Calculate monthly percentage
	if stats.MonthlyRequestLimit == 0 {
		// 0 = unlimited
		stats.UsagePercentages.Monthly = 0
	} else {
		monthlyPct := (float64(stats.MonthlyUsage) / float64(stats.MonthlyRequestLimit)) * 100
		// Cap at 100 max
		if monthlyPct > 100 {
			monthlyPct = 100
		}
		stats.UsagePercentages.Monthly = monthlyPct
	}

	// Get sum of daily limits from all enabled API configs
	query = `
		SELECT COALESCE(SUM(rate_limit_per_day), 0)
		FROM api_configs
		WHERE user_id = $1 AND enabled = true
	`

	var totalDailyLimit int64
	err = u.db.QueryRowContext(ctx, query, userID).Scan(&totalDailyLimit)
	if err != nil {
		return fmt.Errorf("failed to get daily limits: %w", err)
	}

	// Calculate daily percentage
	if totalDailyLimit == 0 {
		// 0 = unlimited or no configs
		stats.UsagePercentages.Daily = 0
	} else {
		dailyPct := (float64(stats.RequestsToday) / float64(totalDailyLimit)) * 100
		// Cap at 100 max
		if dailyPct > 100 {
			dailyPct = 100
		}
		stats.UsagePercentages.Daily = dailyPct
	}

	return nil
}

// GetUsageHistory retrieves time-series usage data for graphing
func (u *UsageTracker) GetUsageHistory(ctx context.Context, userID uuid.UUID, period string) ([]models.UsageHistoryPoint, error) {
	var start time.Time
	now := time.Now()

	// Determine time range based on period
	switch period {
	case "24h":
		start = now.Add(-24 * time.Hour)
	case "7d":
		start = now.Add(-7 * 24 * time.Hour)
	case "30d":
		start = now.Add(-30 * 24 * time.Hour)
	default:
		start = now.Add(-7 * 24 * time.Hour) // Default to 7 days
	}

	// Query to get hourly aggregated data
	query := `
		WITH hourly_data AS (
			SELECT 
				date_trunc('hour', m.timestamp) as hour,
				COUNT(*) as requests,
				COALESCE(
					100.0 * SUM(CASE WHEN m.status_code >= 200 AND m.status_code < 300 THEN 1 ELSE 0 END) / 
					NULLIF(COUNT(*), 0), 
					0
				) as success_rate,
				COALESCE(AVG(m.duration_ms), 0) as avg_response_time_ms
			FROM api_metrics m
			WHERE m.user_id = $1 AND m.timestamp >= $2
			GROUP BY hour
			ORDER BY hour ASC
		)
		SELECT 
			hour as timestamp,
			requests,
			success_rate,
			avg_response_time_ms
		FROM hourly_data
	`

	rows, err := u.db.QueryContext(ctx, query, userID, start)
	if err != nil {
		return nil, fmt.Errorf("failed to get usage history: %w", err)
	}
	defer rows.Close()

	var results []models.UsageHistoryPoint
	for rows.Next() {
		var point models.UsageHistoryPoint
		err := rows.Scan(
			&point.Timestamp,
			&point.Requests,
			&point.SuccessRate,
			&point.AvgResponseTimeMs,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan usage history point: %w", err)
		}
		results = append(results, point)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating usage history: %w", err)
	}

	return results, nil
}

// GetRecentRequests retrieves recent API requests with details
// Supports filtering by limit, api_id, and status_code
func (u *UsageTracker) GetRecentRequests(ctx context.Context, userID uuid.UUID, limit int, filters map[string]interface{}) ([]models.RequestLog, int, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100 // Cap at 100 requests
	}

	// Build query with optional filters
	query := `
		SELECT 
			m.id,
			m.user_id,
			COALESCE(a.id, '00000000-0000-0000-0000-000000000000'::uuid) as api_id,
			m.target_api as api_name,
			COALESCE(a.name, m.target_api) as api_display_name,
			'POST' as method,
			'/' as path,
			m.status_code,
			m.duration_ms as response_time_ms,
			m.timestamp
		FROM api_metrics m
		LEFT JOIN api_configs a ON a.user_id = m.user_id AND (a.name = m.target_api OR a.target_url LIKE '%' || m.target_api || '%')
		WHERE m.user_id = $1
	`

	args := []interface{}{userID}
	argIndex := 2

	// Add filters
	if apiID, ok := filters["api_id"].(string); ok && apiID != "" {
		query += fmt.Sprintf(" AND a.id = $%d", argIndex)
		args = append(args, apiID)
		argIndex++
	}

	if statusCode, ok := filters["status_code"].(int); ok && statusCode > 0 {
		query += fmt.Sprintf(" AND m.status_code = $%d", argIndex)
		args = append(args, statusCode)
		argIndex++
	}

	query += " ORDER BY m.timestamp DESC"
	query += fmt.Sprintf(" LIMIT $%d", argIndex)
	args = append(args, limit)

	rows, err := u.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get recent requests: %w", err)
	}
	defer rows.Close()

	var results []models.RequestLog
	var apiDisplayName string

	for rows.Next() {
		var req models.RequestLog
		err := rows.Scan(
			&req.ID,
			&req.UserID,
			&req.APIID,
			&req.APIName,
			&apiDisplayName,
			&req.Method,
			&req.Path,
			&req.StatusCode,
			&req.ResponseTimeMs,
			&req.Timestamp,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan request log: %w", err)
		}

		// Use display name if available
		if apiDisplayName != "" {
			req.APIName = apiDisplayName
		}

		results = append(results, req)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating request logs: %w", err)
	}

	// Get total count for pagination (without limit)
	countQuery := `
		SELECT COUNT(*)
		FROM api_metrics m
		WHERE m.user_id = $1
	`

	var total int
	err = u.db.QueryRowContext(ctx, countQuery, userID).Scan(&total)
	if err != nil {
		logger.Error("Failed to get total request count", zap.Error(err))
		total = len(results) // Fallback to returned count
	}

	return results, total, nil
}
