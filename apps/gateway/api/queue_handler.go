package api

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// QueueHandler handles queue management endpoints
type QueueHandler struct {
	proxyService *proxy.ProxyService
}

// NewQueueHandler creates a new queue handler
func NewQueueHandler(proxyService *proxy.ProxyService) *QueueHandler {
	return &QueueHandler{
		proxyService: proxyService,
	}
}

// GetQueueStats returns queue statistics
// @Summary Get queue statistics
// @Description Returns statistics about request queues
// @Tags queues
// @Produce json
// @Success 200 {object} proxy.QueueStats
// @Router /api/v1/dashboard/queues [get]
func (h *QueueHandler) GetQueueStats(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	stats := h.proxyService.GetQueueStats(user.ID)
	
	return c.JSON(stats)
}

// GetActiveQueues returns currently queued requests
// @Summary Get active queued requests
// @Description Returns all currently queued requests
// @Tags queues
// @Produce json
// @Success 200 {array} proxy.QueuedRequest
// @Router /api/v1/dashboard/queues/active [get]
func (h *QueueHandler) GetActiveQueues(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	queued := h.proxyService.GetActiveQueues(user.ID)
	
	return c.JSON(queued)
}

// GetQueueConfig returns queue configuration
// @Summary Get queue configuration
// @Description Returns queue configuration settings
// @Tags queues
// @Produce json
// @Success 200 {object} proxy.QueueConfig
// @Router /api/v1/dashboard/queues/config [get]
func (h *QueueHandler) GetQueueConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	config := h.proxyService.GetQueueConfig(user.ID)
	
	return c.JSON(config)
}

// UpdateQueueConfig updates queue configuration
// @Summary Update queue configuration
// @Description Updates queue configuration settings
// @Tags queues
// @Accept json
// @Produce json
// @Param request body proxy.QueueConfig true "Queue configuration"
// @Success 200 {object} proxy.QueueConfig
// @Router /api/v1/dashboard/queues/config [put]
func (h *QueueHandler) UpdateQueueConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	var config proxy.QueueConfig
	if err := c.BodyParser(&config); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	// Validate configuration
	if config.MaxWaitTime <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid configuration",
			Message:   "MaxWaitTime must be greater than zero",
			Timestamp: time.Now(),
		})
	}

	// Update configuration
	updated, err := h.proxyService.UpdateQueueConfig(user.ID, config)
	if err != nil {
		logger.Error("Failed to update queue configuration",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to update queue configuration",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}
	
	return c.JSON(updated)
}

// CancelQueuedRequest cancels a queued request
// @Summary Cancel queued request
// @Description Cancels a request that is currently queued
// @Tags queues
// @Produce json
// @Param request_id path string true "Request ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/dashboard/queues/{request_id} [delete]
func (h *QueueHandler) CancelQueuedRequest(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	requestID := c.Params("request_id")
	if requestID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request",
			Message:   "Request ID is required",
			Timestamp: time.Now(),
		})
	}

	// Parse request ID
	_, err = uuid.Parse(requestID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request ID",
			Message:   fmt.Sprintf("'%s' is not a valid request ID", requestID),
			Timestamp: time.Now(),
		})
	}

	// Cancel the request
	cancelled, err := h.proxyService.CancelQueuedRequest(user.ID, requestID)
	if err != nil {
		if err == proxy.ErrRequestNotFound {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error:     "Request not found",
				Message:   fmt.Sprintf("Request '%s' not found in queue", requestID),
				Timestamp: time.Now(),
			})
		}
		
		logger.Error("Failed to cancel queued request",
			zap.String("user_id", user.ID.String()),
			zap.String("request_id", requestID),
			zap.Error(err),
		)
		
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to cancel request",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}
	
	return c.JSON(fiber.Map{
		"request_id": requestID,
		"cancelled":  cancelled,
		"timestamp":  time.Now(),
	})
}
