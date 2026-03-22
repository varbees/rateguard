package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// GetTokenUsage returns token usage summary for LLM APIs
// @Summary Get LLM token usage
// @Description Returns token usage summary including tokens by model and costs
// @Tags dashboard
// @Produce json
// @Success 200 {object} models.TokenUsageSummary
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/dashboard/tokens [get]
func (h *DashboardHandler) GetTokenUsage(c *fiber.Ctx) error {
	user, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	tokenUsage, err := h.usageTracker.GetMonthlyTokenUsage(c.Context(), user.ID)
	if err != nil {
		logger.Error("Failed to get token usage",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve token usage",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}

	return c.JSON(tokenUsage)
}

// GetModelPricing returns pricing information for all supported LLM models
// @Summary Get model pricing
// @Description Returns pricing for all LLM models (cents per 1M tokens)
// @Tags dashboard
// @Produce json
// @Success 200 {object} []models.ModelPricing
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/models/pricing [get]
func (h *DashboardHandler) GetModelPricing(c *fiber.Ctx) error {
	_, err := middleware.GetUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Error:     "Unauthorized",
			Message:   "Authentication required",
			Timestamp: time.Now(),
		})
	}

	query := `
		SELECT DISTINCT ON (provider, model)
			provider, model, 
			input_price_per_million, output_price_per_million,
			effective_date
		FROM model_pricing
		WHERE deprecated_date IS NULL
		ORDER BY provider, model, effective_date DESC
	`

	rows, err := h.store.GetDB().QueryContext(c.Context(), query)
	if err != nil {
		logger.Error("Failed to get model pricing", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error:     "Failed to retrieve pricing",
			Message:   err.Error(),
			Timestamp: time.Now(),
		})
	}
	defer rows.Close()

	type PricingResponse struct {
		Provider              string    `json:"provider"`
		Model                 string    `json:"model"`
		InputPricePerMillion  int       `json:"input_price_per_million"`
		OutputPricePerMillion int       `json:"output_price_per_million"`
		EffectiveDate         time.Time `json:"effective_date"`
	}

	pricingList := []PricingResponse{}

	for rows.Next() {
		var p PricingResponse
		if err := rows.Scan(&p.Provider, &p.Model, &p.InputPricePerMillion, &p.OutputPricePerMillion, &p.EffectiveDate); err != nil {
			logger.Error("Failed to scan pricing row", zap.Error(err))
			continue
		}
		pricingList = append(pricingList, p)
	}

	return c.JSON(pricingList)
}
