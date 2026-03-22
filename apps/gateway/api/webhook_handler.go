package api

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/internal/webhook"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// WebhookHandler handles webhook relay endpoints
type WebhookHandler struct {
	store         *storage.PostgresStore
	webhookWorker *webhook.WebhookWorker
	config        webhook.WebhookWorkerConfig
}

// NewWebhookHandler creates a new webhook handler
func NewWebhookHandler(
	store *storage.PostgresStore,
	webhookWorker *webhook.WebhookWorker,
	config webhook.WebhookWorkerConfig,
) *WebhookHandler {
	return &WebhookHandler{
		store:         store,
		webhookWorker: webhookWorker,
		config:        config,
	}
}

// HandleWebhookInbox accepts incoming webhooks for relay
// @Summary Accept incoming webhook
// @Description Accepts a webhook payload for reliable delivery with retries
// @Tags webhooks
// @Accept json
// @Produce json
// @Param request body models.WebhookInboxRequest true "Webhook payload"
// @Success 202 {object} models.WebhookInboxResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/webhook/inbox [post]
func (h *WebhookHandler) HandleWebhookInbox(c *fiber.Ctx) error {
	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse request
	var req models.WebhookInboxRequest
	if err := c.BodyParser(&req); err != nil {
		logger.Warn("Failed to parse webhook inbox request",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Validate required fields
	if req.Source == "" || req.EventType == "" || req.TargetURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request",
			Message:   "source, event_type, and target_url are required",
			Timestamp: time.Now(),
		})
	}

	if req.Payload == nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request",
			Message:   "payload is required",
			Timestamp: time.Now(),
		})
	}

	// Create webhook event
	now := time.Now()
	nextAttempt := now.Add(1 * time.Second) // Attempt almost immediately

	event := &models.WebhookEvent{
		ID:            uuid.New(),
		UserID:        user.ID,
		Source:        req.Source,
		EventType:     req.EventType,
		Payload:       req.Payload,
		Headers:       req.Headers,
		TargetURL:     req.TargetURL,
		Status:        models.WebhookStatusPending,
		Retries:       0,
		MaxRetries:    h.config.MaxRetries,
		NextAttemptAt: &nextAttempt,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Persist to database
	if err := h.store.CreateWebhookEvent(c.Context(), event); err != nil {
		logger.Error("Failed to create webhook event",
			zap.String("user_id", user.ID.String()),
			zap.String("source", req.Source),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to accept webhook",
			Timestamp: time.Now(),
		})
	}

	logger.Info("Webhook accepted for delivery",
		zap.String("event_id", event.ID.String()),
		zap.String("user_id", user.ID.String()),
		zap.String("source", req.Source),
		zap.String("event_type", req.EventType),
		zap.String("target_url", req.TargetURL),
	)

	// Return accepted response
	response := models.WebhookInboxResponse{
		ID:         event.ID,
		Status:     "accepted",
		Message:    fmt.Sprintf("Webhook accepted for delivery. Event ID: %s", event.ID.String()),
		ReceivedAt: now,
	}

	return c.Status(fiber.StatusAccepted).JSON(response)
}

// GetWebhookStatus returns webhook event status for user
// @Summary Get webhook events status
// @Description Returns list of webhook events with their delivery status
// @Tags webhooks
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(20)
// @Param status query string false "Filter by status" Enums(pending, processing, delivered, failed, dead_letter)
// @Success 200 {object} models.WebhookStatusResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/webhook/status [get]
func (h *WebhookHandler) GetWebhookStatus(c *fiber.Ctx) error {
	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse pagination parameters
	page := 1
	if pageParam := c.Query("page"); pageParam != "" {
		if p, err := strconv.Atoi(pageParam); err == nil && p > 0 {
			page = p
		}
	}

	pageSize := 20
	if sizeParam := c.Query("page_size"); sizeParam != "" {
		if s, err := strconv.Atoi(sizeParam); err == nil && s > 0 && s <= 100 {
			pageSize = s
		}
	}

	// Parse status filter
	var statusFilter *models.WebhookEventStatus
	if statusParam := c.Query("status"); statusParam != "" {
		status := models.WebhookEventStatus(statusParam)
		// Validate status
		validStatuses := []models.WebhookEventStatus{
			models.WebhookStatusPending,
			models.WebhookStatusProcessing,
			models.WebhookStatusDelivered,
			models.WebhookStatusFailed,
			models.WebhookStatusDeadLetter,
		}
		isValid := false
		for _, validStatus := range validStatuses {
			if status == validStatus {
				isValid = true
				break
			}
		}
		if isValid {
			statusFilter = &status
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Error:     "Invalid status",
				Message:   "status must be one of: pending, processing, delivered, failed, dead_letter",
				Timestamp: time.Now(),
			})
		}
	}

	// Fetch webhook events
	events, totalCount, err := h.store.ListWebhookEvents(
		c.Context(),
		user.ID,
		page,
		pageSize,
		statusFilter,
	)
	if err != nil {
		logger.Error("Failed to list webhook events",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to retrieve webhook status",
			Timestamp: time.Now(),
		})
	}

	// Build response
	response := models.WebhookStatusResponse{
		Events:     events,
		TotalCount: totalCount,
		Page:       page,
		PageSize:   pageSize,
		Timestamp:  time.Now(),
	}

	return c.JSON(response)
}

// GetWebhookStats returns webhook statistics for user
// @Summary Get webhook statistics
// @Description Returns aggregated webhook delivery statistics
// @Tags webhooks
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/webhook/stats [get]
func (h *WebhookHandler) GetWebhookStats(c *fiber.Ctx) error {
	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Get stats from database
	dbStats, err := h.store.GetWebhookStatsByUser(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to get webhook stats",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to retrieve webhook statistics",
			Timestamp: time.Now(),
		})
	}

	// Get worker metrics
	workerMetrics := h.webhookWorker.GetMetrics()

	// Combine stats
	response := fiber.Map{
		"database_stats": dbStats,
		"worker_metrics": workerMetrics,
		"config": fiber.Map{
			"max_retries":       h.config.MaxRetries,
			"base_retry_delay":  h.config.BaseRetryDelay.String(),
			"max_retry_delay":   h.config.MaxRetryDelay.String(),
			"delivery_timeout":  h.config.DeliveryTimeout.String(),
		},
		"timestamp": time.Now(),
	}

	return c.JSON(response)
}

// GetWebhookEvent returns details of a specific webhook event
// @Summary Get webhook event details
// @Description Returns detailed information about a specific webhook event
// @Tags webhooks
// @Produce json
// @Param id path string true "Webhook event ID"
// @Success 200 {object} models.WebhookEvent
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/webhook/events/:id [get]
func (h *WebhookHandler) GetWebhookEvent(c *fiber.Ctx) error {
	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse event ID
	eventIDStr := c.Params("id")
	eventID, err := uuid.Parse(eventIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid event ID",
			Message:   "Event ID must be a valid UUID",
			Timestamp: time.Now(),
		})
	}

	// Fetch event
	event, err := h.store.GetWebhookEvent(c.Context(), eventID)
	if err != nil {
		if err == models.ErrWebhookNotFound {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Not found",
				Message:   "Webhook event not found",
				Timestamp: time.Now(),
			})
		}
		logger.Error("Failed to get webhook event",
			zap.String("user_id", user.ID.String()),
			zap.String("event_id", eventIDStr),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to retrieve webhook event",
			Timestamp: time.Now(),
		})
	}

	// Verify ownership
	if event.UserID != user.ID {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{
			Error:     "Forbidden",
			Message:   "You don't have permission to access this webhook event",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(event)
}

// ReplayWebhook resets a webhook event for retry
// @Summary Replay a webhook event
// @Description Manually resets a webhook event to pending status for retry
// @Tags webhooks
// @Produce json
// @Param id path string true "Webhook event ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/webhook/events/:id/replay [post]
func (h *WebhookHandler) ReplayWebhook(c *fiber.Ctx) error {
	// Get authenticated user
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	// Parse event ID
	eventIDStr := c.Params("id")
	eventID, err := uuid.Parse(eventIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid event ID",
			Message:   "Event ID must be a valid UUID",
			Timestamp: time.Now(),
		})
	}

	// Check ownership first
	event, err := h.store.GetWebhookEvent(c.Context(), eventID)
	if err != nil {
		if err == models.ErrWebhookNotFound {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Not found",
				Message:   "Webhook event not found",
				Timestamp: time.Now(),
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to retrieve webhook event",
			Timestamp: time.Now(),
		})
	}

	if event.UserID != user.ID {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{
			Error:     "Forbidden",
			Message:   "You don't have permission to replay this webhook event",
			Timestamp: time.Now(),
		})
	}

	// Perform replay
	if err := h.store.ReplayWebhook(c.Context(), eventID); err != nil {
		logger.Error("Failed to replay webhook",
			zap.String("user_id", user.ID.String()),
			zap.String("event_id", eventIDStr),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Internal server error",
			Message:   "Failed to replay webhook",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Webhook scheduled for replay",
		"id":      eventIDStr,
		"status":  "pending",
	})
}
