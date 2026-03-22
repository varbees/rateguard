package analytics

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/internal/websocket"
	"go.uber.org/zap"
)

// APIMetricsPublisher periodically publishes per-API metrics via WebSocket
type APIMetricsPublisher struct {
	db              *sql.DB
	usageTracker    *storage.UsageTracker
	webSocketHub    *websocket.Hub
	logger          *zap.Logger
	publishInterval time.Duration
	stopChan        chan struct{}
}

// NewAPIMetricsPublisher creates a new API metrics publisher
func NewAPIMetricsPublisher(
	db *sql.DB,
	usageTracker *storage.UsageTracker,
	webSocketHub *websocket.Hub,
	logger *zap.Logger,
) *APIMetricsPublisher {
	return &APIMetricsPublisher{
		db:              db,
		usageTracker:    usageTracker,
		webSocketHub:    webSocketHub,
		logger:          logger,
		publishInterval: 5 * time.Second, // Publish every 5 seconds
		stopChan:        make(chan struct{}),
	}
}

// Start begins publishing metrics periodically
func (p *APIMetricsPublisher) Start(ctx context.Context) {
	ticker := time.NewTicker(p.publishInterval)
	defer ticker.Stop()

	p.logger.Info("API metrics publisher started",
		zap.Duration("interval", p.publishInterval),
	)

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("API metrics publisher stopped")
			return
		case <-p.stopChan:
			p.logger.Info("API metrics publisher stopped")
			return
		case <-ticker.C:
			p.publishMetrics(ctx)
		}
	}
}

// Stop gracefully stops the publisher
func (p *APIMetricsPublisher) Stop() {
	close(p.stopChan)
}

// publishMetrics fetches and publishes metrics for all active APIs
func (p *APIMetricsPublisher) publishMetrics(ctx context.Context) {
	// Get all active APIs from database
	rows, err := p.db.QueryContext(ctx, `
		SELECT DISTINCT user_id, id, name
		FROM api_configs
		WHERE enabled = true
		ORDER BY user_id, id
		LIMIT 100
	`)
	if err != nil {
		p.logger.Error("Failed to query active APIs", zap.Error(err))
		return
	}
	defer rows.Close()

	publishedCount := 0

	for rows.Next() {
		var userID, apiID uuid.UUID
		var apiName string

		if err := rows.Scan(&userID, &apiID, &apiName); err != nil {
			p.logger.Warn("Failed to scan API row", zap.Error(err))
			continue
		}

		// Get metrics for this API
		metrics, err := p.usageTracker.GetAPIMetrics(ctx, userID, apiID)
		if err != nil {
			p.logger.Debug("Failed to get API metrics",
				zap.String("api_id", apiID.String()),
				zap.Error(err),
			)
			continue
		}

		// Only publish if there's recent activity
		if metrics.LastRequestAt != nil {
			timeSinceLastRequest := time.Since(*metrics.LastRequestAt)
			if timeSinceLastRequest > 1*time.Hour {
				// Skip APIs with no recent activity
				continue
			}
		}

		// Publish metrics update
		event := websocket.WebSocketEvent{
			Type:      websocket.EventAPIMetricsUpdate,
			Timestamp: time.Now().Unix(),
			Data: map[string]interface{}{
				"api_id":   apiID.String(),
				"api_name": apiName,
				"metrics": map[string]interface{}{
					"requests_today":  metrics.RequestsToday,
					"requests_hour":   metrics.RequestsHour,
					"success_rate":    metrics.SuccessRate,
					"avg_latency_ms":  metrics.AvgLatencyMs,
					"p95_latency_ms":  metrics.P95LatencyMs,
					"error_count":     metrics.ErrorCount,
					"last_request_at": metrics.LastRequestAt,
				},
			},
		}

		// Broadcast to all clients (frontend will filter for relevant API)
		if err := p.webSocketHub.Publish(event); err != nil {
			p.logger.Debug("Failed to publish API metrics",
				zap.String("api_id", apiID.String()),
				zap.Error(err),
			)
		}
		publishedCount++
	}

	if publishedCount > 0 {
		p.logger.Debug("Published API metrics updates",
			zap.Int("count", publishedCount),
		)
	}
}
