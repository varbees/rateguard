package analytics

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

// CostEstimator calculates API cost estimates
type CostEstimator struct {
	db *sql.DB
}

// NewCostEstimator creates a new cost estimator
func NewCostEstimator(db *sql.DB) *CostEstimator {
	return &CostEstimator{db: db}
}

// Hardcoded rate table - cost per request
var providerRates = map[string]float64{
	"openai": 0.002,  // $0.002 per request
	"claude": 0.0015, // $0.0015 per request
	// Default fallback
	"default": 0.001, // $0.001 per request
}

// GetCostPerRequest returns the cost per request for a given API
func getCostPerRequest(apiName string) float64 {
	apiNameLower := strings.ToLower(apiName)
	
	// Check if API name contains known provider
	for provider, rate := range providerRates {
		if strings.Contains(apiNameLower, provider) {
			return rate
		}
	}
	
	return providerRates["default"]
}

// GetCostEstimate calculates today's cost and monthly projection
func (e *CostEstimator) GetCostEstimate(ctx context.Context, userID uuid.UUID) (*models.CostEstimate, error) {
	now := time.Now()
	
	// Get today's request counts per API
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	
	query := `
		SELECT 
			ac.id as api_id,
			ac.name as api_name,
			COUNT(*) as request_count
		FROM api_metrics am
		JOIN api_configs ac ON am.user_id = ac.user_id AND am.target_api = ac.name
		WHERE am.user_id = $1
		  AND am.timestamp >= $2
		GROUP BY ac.id, ac.name
	`
	
	rows, err := e.db.QueryContext(ctx, query, userID, todayStart)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var totalTodayCost float64
	apiCosts := []models.APICost{}
	
	for rows.Next() {
		var apiID uuid.UUID
		var apiName string
		var requestCount int64
		
		if err := rows.Scan(&apiID, &apiName, &requestCount); err != nil {
			continue
		}
		
		costPerReq := getCostPerRequest(apiName)
		apiCost := float64(requestCount) * costPerReq
		totalTodayCost += apiCost
		
		apiCosts = append(apiCosts, models.APICost{
			APIID:        apiID,
			APIName:      apiName,
			RequestCount: requestCount,
			CostPerReq:   costPerReq,
			TotalCost:    apiCost,
		})
	}
	
	// Calculate monthly projection
	// Simple projection: (today's cost / hours elapsed) * 24 * days_in_month
	hoursElapsed := time.Since(todayStart).Hours()
	if hoursElapsed < 1 {
		hoursElapsed = 1 // Avoid division by zero
	}
	
	daysInMonth := float64(time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, now.Location()).Day())
	monthlyProjection := (totalTodayCost / hoursElapsed) * 24 * daysInMonth
	
	// Get month-to-date actual cost
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	
	var mtdRequestCount int64
	err = e.db.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(*), 0)
		FROM api_metrics
		WHERE user_id = $1
		  AND timestamp >= $2
	`, userID, monthStart).Scan(&mtdRequestCount)
	
	if err != nil {
		return nil, err
	}
	
	// Estimate MTD cost using average cost per request from today's data
	avgCostPerReq := providerRates["default"]
	if len(apiCosts) > 0 {
		totalReqs := int64(0)
		for _, ac := range apiCosts {
			totalReqs += ac.RequestCount
		}
		if totalReqs > 0 {
			avgCostPerReq = totalTodayCost / float64(totalReqs)
		}
	}
	mtdCost := float64(mtdRequestCount) * avgCostPerReq
	
	// NEW: Get token-based costs for LLM APIs
	tokensByModel, costByModel, mtdTokens, tokenCost := e.getTokenBasedCosts(ctx, userID, monthStart, now)
	
	// Combine request-based and token-based costs
	totalMTDCost := mtdCost + tokenCost

	return &models.CostEstimate{
		TodayCost:         totalTodayCost,
		MonthlyProjection: monthlyProjection,
		MTDCost:           totalMTDCost,
		MTDRequests:       mtdRequestCount,
		APICosts:          apiCosts,
		// NEW: Token metrics
		MTDTokens:         mtdTokens,
		TokensByModel:     tokensByModel,
		CostByModel:       costByModel,
		CalculatedAt:      now,
	}, nil
}

// getTokenBasedCosts calculates costs from LLM token usage
func (e *CostEstimator) getTokenBasedCosts(ctx context.Context, userID uuid.UUID, start, end time.Time) (map[string]int64, map[string]float64, int64, float64) {
	query := `
		SELECT 
			COALESCE(model_used, 'unknown') as model,
			SUM(total_tokens) as tokens,
			SUM(estimated_cost_cents) as cost_cents
		FROM api_metrics
		WHERE user_id = $1 
		  AND timestamp >= $2 
		  AND timestamp < $3
		  AND total_tokens > 0
		GROUP BY model_used
	`

	rows, err := e.db.QueryContext(ctx, query, userID, start, end)
	if err != nil {
		return nil, nil, 0, 0.0
	}
	defer rows.Close()

	tokensByModel := make(map[string]int64)
	costByModel := make(map[string]float64)
	var totalTokens int64
	var totalCostCents int

	for rows.Next() {
		var model string
		var tokens int64
		var costCents int

		if err := rows.Scan(&model, &tokens, &costCents); err != nil {
			continue
		}

		tokensByModel[model] = tokens
		costByModel[model] = float64(costCents) / 100.0
		totalTokens += tokens
		totalCostCents += costCents
	}

	return tokensByModel, costByModel, totalTokens, float64(totalCostCents) / 100.0
}
