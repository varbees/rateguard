package api

import (
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/internal/analytics"
	"github.com/varbees/rateguard/internal/guardrails"
	"go.uber.org/zap"
)

// GuardrailHandler handles cost guardrail endpoints.
type GuardrailHandler struct {
	service   *guardrails.Service
	optimizer *analytics.CostOptimizer
	logger    *zap.Logger
}

// NewGuardrailHandler creates a new cost guardrail handler.
func NewGuardrailHandler(db *sql.DB, logger *zap.Logger) *GuardrailHandler {
	return &GuardrailHandler{
		service:   guardrails.NewService(db, logger),
		optimizer: analytics.NewCostOptimizer(db, logger),
		logger:    logger,
	}
}

// CreateGuardrailConfigRequest captures the dashboard guardrail payload.
type CreateGuardrailConfigRequest struct {
	MonthlyBudgetCents int     `json:"monthly_budget_cents" validate:"required,min=100"`
	AlertThresholdPct  int     `json:"alert_threshold_pct" validate:"required,min=1,max=100"`
	HardLimitPct       int     `json:"hard_limit_pct" validate:"required,min=1,max=200"`
	NotifyEmail        bool    `json:"notify_email"`
	NotifyWebhook      bool    `json:"notify_webhook"`
	WebhookURL         *string `json:"webhook_url,omitempty" validate:"omitempty,url"`
	Enabled            bool    `json:"enabled"`
}

// CreateOrUpdateGuardrailConfig creates or updates a user's cost guardrail configuration.
func (h *GuardrailHandler) CreateOrUpdateGuardrailConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	var req CreateGuardrailConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid request body",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	if req.HardLimitPct <= req.AlertThresholdPct {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid thresholds",
			Message:   "Hard limit must be greater than alert threshold",
			Timestamp: time.Now(),
		})
	}

	config := guardrails.Config{
		UserID:             user.ID,
		MonthlyBudgetCents: req.MonthlyBudgetCents,
		AlertThresholdPct:  req.AlertThresholdPct,
		HardLimitPct:       req.HardLimitPct,
		NotifyEmail:        req.NotifyEmail,
		NotifyWebhook:      req.NotifyWebhook,
		WebhookURL:         req.WebhookURL,
		Enabled:            req.Enabled,
	}

	result, err := h.service.CreateConfig(c.Context(), config)
	if err != nil {
		h.logger.Error("Failed to create cost guardrail config",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to create cost guardrail configuration",
			Message:   "Unable to save cost guardrail settings",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(result)
}

// GetGuardrailConfig retrieves the user's cost guardrail configuration.
func (h *GuardrailHandler) GetGuardrailConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	config, err := h.service.GetConfig(c.Context(), user.ID)
	if err != nil {
		h.logger.Error("Failed to get cost guardrail config",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve cost guardrail configuration",
			Message:   "Unable to fetch cost guardrail settings",
			Timestamp: time.Now(),
		})
	}

	if config == nil {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "Cost guardrails not configured",
			Message:   "No cost guardrail configuration found. Please create one first.",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(config)
}

// DeleteGuardrailConfig soft-disables the user's cost guardrails.
func (h *GuardrailHandler) DeleteGuardrailConfig(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	config, err := h.service.GetConfig(c.Context(), user.ID)
	if err != nil || config == nil {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "Cost guardrails not found",
			Message:   "No cost guardrail configuration to disable",
			Timestamp: time.Now(),
		})
	}

	config.Enabled = false
	if _, err := h.service.CreateConfig(c.Context(), *config); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to disable cost guardrails",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Cost guardrails disabled successfully",
	})
}

// GetGuardrailAlerts returns a user's cost guardrail alerts.
func (h *GuardrailHandler) GetGuardrailAlerts(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	includeAcknowledged := c.QueryBool("include_acknowledged", false)
	alerts, err := h.service.GetAlerts(c.Context(), user.ID, includeAcknowledged)
	if err != nil {
		h.logger.Error("Failed to get cost guardrail alerts",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve alerts",
			Message:   "Unable to fetch cost guardrail alerts",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(alerts)
}

// AcknowledgeAlert marks an alert as acknowledged.
func (h *GuardrailHandler) AcknowledgeAlert(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	alertID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error:     "Invalid alert ID",
			Message:   "Alert ID must be a valid UUID",
			Timestamp: time.Now(),
		})
	}

	if err := h.service.AcknowledgeAlert(c.Context(), alertID, user.ID); err != nil {
		h.logger.Error("Failed to acknowledge cost guardrail alert",
			zap.String("user_id", user.ID.String()),
			zap.String("alert_id", alertID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Error:     "Alert not found",
			Message:   "Unable to acknowledge alert",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Alert acknowledged successfully",
	})
}

// GetOptimizations returns cost optimization suggestions.
func (h *GuardrailHandler) GetOptimizations(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	suggestions, err := h.optimizer.AnalyzeUsage(c.Context(), user.ID)
	if err != nil {
		h.logger.Error("Failed to get cost optimizations",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to analyze usage",
			Message:   "Unable to generate optimization suggestions",
			Timestamp: time.Now(),
		})
	}

	if suggestions == nil {
		suggestions = []guardrails.OptimizationSuggestion{}
	}

	return c.JSON(fiber.Map{
		"suggestions":  suggestions,
		"total_count":  len(suggestions),
		"generated_at": time.Now(),
	})
}
