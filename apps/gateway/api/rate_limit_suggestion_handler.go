package api

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/analytics"
	"github.com/varbees/rateguard/internal/models"
	"go.uber.org/zap"
)

type RateLimitSuggestionHandler struct {
	analyzer *analytics.RateLimitAnalyzer
	db       *sql.DB
	logger   *zap.Logger
}

func NewRateLimitSuggestionHandler(analyzer *analytics.RateLimitAnalyzer, db *sql.DB, logger *zap.Logger) *RateLimitSuggestionHandler {
	return &RateLimitSuggestionHandler{
		analyzer: analyzer,
		db:       db,
		logger:   logger,
	}
}

// GetSuggestions returns rate limit recommendations
func (h *RateLimitSuggestionHandler) GetSuggestions(c *fiber.Ctx) error {
	user := c.Locals("user").(*models.User)
	apiID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid API ID"})
	}

	suggestion, err := h.analyzer.GetRateLimitSuggestions(c.Context(), user.ID, apiID)
	if err != nil {
		h.logger.Error("Failed to get rate limit suggestions",
			zap.String("user_id", user.ID.String()),
			zap.String("api_id", apiID.String()),
			zap.Error(err),
		)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to get suggestions"})
	}

	if suggestion == nil {
		return c.JSON(fiber.Map{
			"message":    "No rate limit observations available yet",
			"suggestion": nil,
		})
	}

	return c.JSON(suggestion)
}

// GetObservations returns raw rate limit observations
func (h *RateLimitSuggestionHandler) GetObservations(c *fiber.Ctx) error {
	user := c.Locals("user").(*models.User)
	apiID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid API ID"})
	}

	// Query observations
	rows, err := h.db.QueryContext(c.Context(), `
		SELECT id, limit_per_window, window_seconds, source_header,
		       observed_at, response_status
		FROM rate_limit_observations
		WHERE api_id = $1 AND user_id = $2
		ORDER BY observed_at DESC
		LIMIT 50
	`, apiID, user.ID)
	if err != nil {
		h.logger.Error("Failed to fetch rate limit observations",
			zap.String("user_id", user.ID.String()),
			zap.String("api_id", apiID.String()),
			zap.Error(err),
		)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch observations"})
	}
	defer rows.Close()

	observations := []map[string]interface{}{}
	for rows.Next() {
		var obs struct {
			ID             uuid.UUID
			LimitPerWindow sql.NullInt64
			WindowSeconds  sql.NullInt32
			SourceHeader   string
			ObservedAt     time.Time
			ResponseStatus int
		}
		if err := rows.Scan(&obs.ID, &obs.LimitPerWindow, &obs.WindowSeconds,
			&obs.SourceHeader, &obs.ObservedAt, &obs.ResponseStatus); err != nil {
			continue
		}

		observation := map[string]interface{}{
			"id":              obs.ID,
			"source_header":   obs.SourceHeader,
			"observed_at":     obs.ObservedAt,
			"response_status": obs.ResponseStatus,
		}

		if obs.LimitPerWindow.Valid {
			observation["limit_per_window"] = obs.LimitPerWindow.Int64
		}
		if obs.WindowSeconds.Valid {
			observation["window_seconds"] = obs.WindowSeconds.Int32
		}

		observations = append(observations, observation)
	}

	return c.JSON(observations)
}

// ApplySuggestion applies suggested rate limits to API config
func (h *RateLimitSuggestionHandler) ApplySuggestion(c *fiber.Ctx) error {
	user := c.Locals("user").(*models.User)
	apiID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid API ID"})
	}

	suggestion, err := h.analyzer.GetRateLimitSuggestions(c.Context(), user.ID, apiID)
	if err != nil || suggestion == nil {
		return c.Status(400).JSON(fiber.Map{"error": "No suggestions available"})
	}

	// Build update query dynamically based on available suggestions
	updates := []string{}
	args := []interface{}{}
	argPos := 1

	if suggestion.SuggestedPerSecond != nil {
		updates = append(updates, "rate_limit_per_second = $"+formatArgPos(argPos))
		args = append(args, *suggestion.SuggestedPerSecond)
		argPos++
	}

	if suggestion.SuggestedPerMinute != nil {
		updates = append(updates, "rate_limit_per_minute = $"+formatArgPos(argPos))
		args = append(args, *suggestion.SuggestedPerMinute)
		argPos++
	}

	if suggestion.SuggestedPerHour != nil {
		updates = append(updates, "rate_limit_per_hour = $"+formatArgPos(argPos))
		args = append(args, *suggestion.SuggestedPerHour)
		argPos++
	}

	if suggestion.SuggestedPerDay != nil {
		updates = append(updates, "rate_limit_per_day = $"+formatArgPos(argPos))
		args = append(args, *suggestion.SuggestedPerDay)
		argPos++
	}

	if len(updates) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "No valid suggestions to apply"})
	}

	// Add updated_at
	updates = append(updates, "updated_at = NOW()")

	// Add WHERE clause parameters
	args = append(args, apiID, user.ID)

	query := "UPDATE api_configs SET " + joinStrings(updates, ", ") +
		" WHERE id = $" + formatArgPos(argPos) + " AND user_id = $" + formatArgPos(argPos+1)

	_, err = h.db.ExecContext(c.Context(), query, args...)
	if err != nil {
		h.logger.Error("Failed to apply rate limit suggestions",
			zap.String("user_id", user.ID.String()),
			zap.String("api_id", apiID.String()),
			zap.Error(err),
		)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to apply suggestions"})
	}

	h.logger.Info("Applied rate limit suggestions",
		zap.String("user_id", user.ID.String()),
		zap.String("api_id", apiID.String()),
		zap.Int("confidence", suggestion.ConfidenceScore),
	)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Rate limits updated based on suggestions",
		"applied": fiber.Map{
			"per_second": suggestion.SuggestedPerSecond,
			"per_minute": suggestion.SuggestedPerMinute,
			"per_hour":   suggestion.SuggestedPerHour,
			"per_day":    suggestion.SuggestedPerDay,
		},
	})
}

// Helper functions
func formatArgPos(pos int) string {
	return fmt.Sprintf("%d", pos)
}

func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}
