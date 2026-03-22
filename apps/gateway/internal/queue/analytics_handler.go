package queue

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// AnalyticsEventHandler processes analytics events and writes to database
type AnalyticsEventHandler struct {
	db *sql.DB
}

// NewAnalyticsEventHandler creates a new analytics event handler
func NewAnalyticsEventHandler(db *sql.DB) *AnalyticsEventHandler {
	return &AnalyticsEventHandler{
		db: db,
	}
}

// Handle processes a batch of events and writes to database
// This is called by the event queue consumer
func (h *AnalyticsEventHandler) Handle(ctx context.Context, events []*Event) error {
	if len(events) == 0 {
		return nil
	}
	
	logger.Debug("Processing analytics event batch",
		zap.Int("batch_size", len(events)),
	)
	
	// Start transaction for batch insert
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()
	
	// Process events by type
	var requestCount, responseCount, llmCount int
	
	for _, event := range events {
		switch event.Type {
		case EventTypeRequest:
			if err := h.handleRequest(ctx, tx, event); err != nil {
				logger.Error("Failed to handle request event",
					zap.String("event_id", event.ID),
					zap.Error(err),
				)
				return err
			}
			requestCount++
			
		case EventTypeResponse:
			if err := h.handleResponse(ctx, tx, event); err != nil {
				logger.Error("Failed to handle response event",
					zap.String("event_id", event.ID),
					zap.Error(err),
				)
				return err
			}
			responseCount++
			
		case EventTypeLLM:
			if err := h.handleLLMResponse(ctx, tx, event); err != nil {
				logger.Error("Failed to handle LLM event",
					zap.String("event_id", event.ID),
					zap.Error(err),
				)
				return err
			}
			llmCount++
			
		default:
			logger.Warn("Unknown event type",
				zap.String("event_id", event.ID),
				zap.String("type", string(event.Type)),
			)
		}
	}
	
	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	
	logger.Info("Analytics batch processed successfully",
		zap.Int("total", len(events)),
		zap.Int("requests", requestCount),
		zap.Int("responses", responseCount),
		zap.Int("llm", llmCount),
	)
	
	return nil
}

// handleRequest handles a request event (daily aggregation)
func (h *AnalyticsEventHandler) handleRequest(ctx context.Context, tx *sql.Tx, event *Event) error {
	usageDate := time.Date(
		event.Timestamp.Year(),
		event.Timestamp.Month(),
		event.Timestamp.Day(),
		0, 0, 0, 0,
		event.Timestamp.Location(),
	)
	
	query := `
		INSERT INTO api_usage (user_id, target_api, requests, usage_date, timestamp)
		VALUES ($1, $2, 1, $3, $4)
		ON CONFLICT (user_id, target_api, usage_date)
		DO UPDATE SET 
			requests = api_usage.requests + 1,
			timestamp = $4
	`
	
	_, err := tx.ExecContext(
		ctx, query,
		event.UserID,
		event.Data.TargetAPI,
		usageDate,
		event.Timestamp,
	)
	
	return err
}

// handleResponse handles a response event (metrics table)
func (h *AnalyticsEventHandler) handleResponse(ctx context.Context, tx *sql.Tx, event *Event) error {
	query := `
		INSERT INTO api_metrics (user_id, target_api, status_code, duration_ms, timestamp)
		VALUES ($1, $2, $3, $4, $5)
	`
	
	_, err := tx.ExecContext(
		ctx, query,
		event.UserID,
		event.Data.TargetAPI,
		event.Data.StatusCode,
		event.Data.DurationMs,
		event.Timestamp,
	)
	
	return err
}

// handleLLMResponse handles an LLM response event with token tracking
func (h *AnalyticsEventHandler) handleLLMResponse(ctx context.Context, tx *sql.Tx, event *Event) error {
	// Insert into api_metrics with token data
	metricsQuery := `
		INSERT INTO api_metrics (
			user_id, target_api, model_used,
			input_tokens, output_tokens, total_tokens,
			estimated_cost_cents, status_code, duration_ms, timestamp
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	
	_, err := tx.ExecContext(
		ctx, metricsQuery,
		event.UserID,
		event.Data.TargetAPI,
		event.Data.Model,
		event.Data.InputTokens,
		event.Data.OutputTokens,
		event.Data.TotalTokens,
		event.Data.CostCents,
		event.Data.StatusCode,
		event.Data.DurationMs,
		event.Timestamp,
	)
	
	if err != nil {
		return fmt.Errorf("failed to insert LLM metrics: %w", err)
	}
	
	// Update daily aggregation
	usageDate := time.Date(
		event.Timestamp.Year(),
		event.Timestamp.Month(),
		event.Timestamp.Day(),
		0, 0, 0, 0,
		event.Timestamp.Location(),
	)
	
	usageQuery := `
		INSERT INTO api_usage (
			user_id, target_api, requests, 
			total_tokens, total_cost_cents, 
			usage_date, timestamp
		)
		VALUES ($1, $2, 1, $3, $4, $5, $6)
		ON CONFLICT (user_id, target_api, usage_date)
		DO UPDATE SET
			requests = api_usage.requests + 1,
			total_tokens = api_usage.total_tokens + $3,
			total_cost_cents = api_usage.total_cost_cents + $4,
			timestamp = $6
	`
	
	_, err = tx.ExecContext(
		ctx, usageQuery,
		event.UserID,
		event.Data.TargetAPI,
		event.Data.TotalTokens,
		event.Data.CostCents,
		usageDate,
		event.Timestamp,
	)
	
	return err
}
