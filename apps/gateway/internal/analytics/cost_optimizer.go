package analytics

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/guardrails"
	"go.uber.org/zap"
)

// CostOptimizer analyzes usage and generates optimization suggestions
type CostOptimizer struct {
	db     *sql.DB
	logger *zap.Logger
}

// NewCostOptimizer creates a new cost optimizer
func NewCostOptimizer(db *sql.DB, logger *zap.Logger) *CostOptimizer {
	return &CostOptimizer{
		db:     db,
		logger: logger,
	}
}

// AnalyzeUsage analyzes user's usage patterns and generates optimization suggestions
func (o *CostOptimizer) AnalyzeUsage(ctx context.Context, userID uuid.UUID) ([]guardrails.OptimizationSuggestion, error) {
	var suggestions []guardrails.OptimizationSuggestion

	// 1. Analyze model usage for cheaper alternatives
	modelSuggestions, err := o.analyzeModelUsage(ctx, userID)
	if err != nil {
		o.logger.Error("Failed to analyze model usage", zap.Error(err))
	} else {
		suggestions = append(suggestions, modelSuggestions...)
	}

	// 2. Detect high-error rate APIs
	errorSuggestions, err := o.analyzeErrorRates(ctx, userID)
	if err != nil {
		o.logger.Error("Failed to analyze error rates", zap.Error(err))
	} else {
		suggestions = append(suggestions, errorSuggestions...)
	}

	// 3. Identify caching opportunities
	cacheSuggestions, err := o.analyzeCachingOpportunities(ctx, userID)
	if err != nil {
		o.logger.Error("Failed to analyze caching", zap.Error(err))
	} else {
		suggestions = append(suggestions, cacheSuggestions...)
	}

	return suggestions, nil
}

// analyzeModelUsage checks if user can save by switching to cheaper models
func (o *CostOptimizer) analyzeModelUsage(ctx context.Context, userID uuid.UUID) ([]guardrails.OptimizationSuggestion, error) {
	// Get top 3 most used expensive models
	query := `
		SELECT 
			model_used,
			COUNT(*) as request_count,
			SUM(total_tokens) as total_tokens,
			SUM(estimated_cost_cents) as total_cost_cents
		FROM api_metrics
		WHERE user_id = $1
		  AND timestamp >= DATE_TRUNC('month', NOW())
		  AND model_used IN ('gpt-4', 'gpt-4-turbo', 'claude-3-opus')
		GROUP BY model_used
		ORDER BY total_cost_cents DESC
		LIMIT 3
	`

	rows, err := o.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suggestions []guardrails.OptimizationSuggestion
	
	for rows.Next() {
		var model string
		var requestCount int
		var totalTokens int64
		var totalCostCents int

		if err := rows.Scan(&model, &requestCount, &totalTokens, &totalCostCents); err != nil {
			continue
		}

		// Skip if usage is too low
		if totalCostCents < 100 { // Less than $1
			continue
		}

		// Calculate savings for model switching
		var cheaperModel string
		var savingsMultiplier float64

		switch model {
		case "gpt-4", "gpt-4-turbo":
			cheaperModel = "gpt-3.5-turbo"
			savingsMultiplier = 0.90 // ~90% cheaper
		case "claude-3-opus":
			cheaperModel = "claude-3-sonnet"
			savingsMultiplier = 0.80 // ~80% cheaper
		default:
			continue
		}

		currentCost := float64(totalCostCents) / 100
		projectedCost := currentCost * (1 - savingsMultiplier)
		savings := currentCost - projectedCost

		if savings > 1.0 { // Only suggest if saves > $1
			suggestions = append(suggestions, guardrails.OptimizationSuggestion{
				Type:          "model_switch",
				CurrentCost:   currentCost,
				ProjectedCost: projectedCost,
				Savings:       savings,
				Description:   fmt.Sprintf("Switch from %s to %s to save $%.2f/month (%d requests, %d tokens)", 
					model, cheaperModel, savings, requestCount, totalTokens),
			})
		}
	}

	return suggestions, nil
}

// analyzeErrorRates identifies APIs with high error rates that waste quota
func (o *CostOptimizer) analyzeErrorRates(ctx context.Context, userID uuid.UUID) ([]guardrails.OptimizationSuggestion, error) {
	query := `
		SELECT 
			api_id,
			ac.name as api_name,
			COUNT(*) as total_requests,
			SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
			SUM(estimated_cost_cents) as total_cost_cents
		FROM api_metrics am
		JOIN api_configs ac ON am.api_id = ac.id
		WHERE am.user_id = $1
		  AND am.timestamp >= NOW() - INTERVAL '7 days'
		GROUP BY api_id, ac.name
		HAVING SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::float / COUNT(*) > 0.1
		ORDER BY error_count DESC
		LIMIT 5
	`

	rows, err := o.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suggestions []guardrails.OptimizationSuggestion

	for rows.Next() {
		var apiID uuid.UUID
		var apiName string
		var totalRequests, errorCount, totalCostCents int

		if err := rows.Scan(&apiID, &apiName, &totalRequests, &errorCount, &totalCostCents); err != nil {
			continue
		}

		errorRate := float64(errorCount) / float64(totalRequests)
		currentCost := float64(totalCostCents) / 100
		wastedCost := currentCost * errorRate

		if wastedCost > 0.5 { // Only suggest if wasting > $0.50
			suggestions = append(suggestions, guardrails.OptimizationSuggestion{
				Type:          "reduce_errors",
				CurrentCost:   currentCost,
				ProjectedCost: currentCost - wastedCost,
				Savings:       wastedCost,
				Description:   fmt.Sprintf("API '%s' has %.1f%% error rate, wasting $%.2f/week. Review API configuration or upstream service.", 
					apiName, errorRate*100, wastedCost),
			})
		}
	}

	return suggestions, nil
}

// analyzeCachingOpportunities identifies repeated identical requests
func (o *CostOptimizer) analyzeCachingOpportunities(ctx context.Context, userID uuid.UUID) ([]guardrails.OptimizationSuggestion, error) {
	// This is a simplified version - in production, would analyze request bodies
	query := `
		SELECT 
			api_id,
			ac.name as api_name,
			COUNT(*) as total_requests,
			SUM(estimated_cost_cents) as total_cost_cents
		FROM api_metrics am
		JOIN api_configs ac ON am.api_id = ac.id
		WHERE am.user_id = $1
		  AND am.timestamp >= NOW() - INTERVAL '24 hours'
		  AND ac.is_llm_api = TRUE
		GROUP BY api_id, ac.name
		HAVING COUNT(*) > 100
		ORDER BY total_requests DESC
		LIMIT 3
	`

	rows, err := o.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suggestions []guardrails.OptimizationSuggestion

	for rows.Next() {
		var apiID uuid.UUID
		var apiName string
		var totalRequests, totalCostCents int

		if err := rows.Scan(&apiID, &apiName, &totalRequests, &totalCostCents); err != nil {
			continue
		}

		// Estimate 20% of requests could be cached
		currentCost := float64(totalCostCents) / 100
		estimatedSavings := currentCost * 0.20

		if estimatedSavings > 1.0 {
			suggestions = append(suggestions, guardrails.OptimizationSuggestion{
				Type:          "caching",
				CurrentCost:   currentCost,
				ProjectedCost: currentCost - estimatedSavings,
				Savings:       estimatedSavings,
				Description:   fmt.Sprintf("API '%s' has %d requests/day. Implement caching to potentially save $%.2f/day (~20%% cache hit rate).", 
					apiName, totalRequests, estimatedSavings),
			})
		}
	}

	return suggestions, nil
}
