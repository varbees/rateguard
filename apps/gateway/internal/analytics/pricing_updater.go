package analytics

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// PricingUpdater fetches and updates model pricing from provider sources
type PricingUpdater struct {
	db *sql.DB
}

// NewPricingUpdater creates a new pricing updater service
func NewPricingUpdater(db *sql.DB) *PricingUpdater {
	return &PricingUpdater{db: db}
}

// StartBackgroundUpdater runs pricing updates every 24 hours
func (p *PricingUpdater) StartBackgroundUpdater(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	// Run immediately on startup
	if err := p.UpdateAllPricing(ctx); err != nil {
		logger.Error("Initial pricing update failed", zap.Error(err))
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := p.UpdateAllPricing(ctx); err != nil {
				logger.Error("Scheduled pricing update failed", zap.Error(err))
			}
		}
	}
}

// UpdateAllPricing fetches pricing for all providers
func (p *PricingUpdater) UpdateAllPricing(ctx context.Context) error {
	logger.Info("Starting pricing update from provider sources")

	var errors []error

	// Update OpenAI pricing
	if err := p.UpdateOpenAIPricing(ctx); err != nil {
		errors = append(errors, fmt.Errorf("OpenAI: %w", err))
	}

	// Update Anthropic pricing
	if err := p.UpdateAnthropicPricing(ctx); err != nil {
		errors = append(errors, fmt.Errorf("Anthropic: %w", err))
	}

	// Update Groq pricing
	if err := p.UpdateGroqPricing(ctx); err != nil {
		errors = append(errors, fmt.Errorf("Groq: %w", err))
	}

	// Update Cohere pricing
	if err := p.UpdateCoherePricing(ctx); err != nil {
		errors = append(errors, fmt.Errorf("Cohere: %w", err))
	}

	if len(errors) > 0 {
		return fmt.Errorf("pricing update errors: %v", errors)
	}

	logger.Info("Pricing update completed successfully")
	return nil
}

// UpdateOpenAIPricing fetches OpenAI pricing
// NOTE: OpenAI doesn't have a public pricing API, using hardcoded values
func (p *PricingUpdater) UpdateOpenAIPricing(ctx context.Context) error {
	knownModels := map[string]struct {
		InputPrice  int
		OutputPrice int
	}{
		"gpt-4-turbo":   {1000, 3000},  // $10/$30 per 1M
		"gpt-4":         {3000, 6000},  // $30/$60 per 1M
		"gpt-3.5-turbo": {50, 150},     // $0.50/$1.50 per 1M
		"gpt-4o":        {500, 1500},   // $5/$15 per 1M
	}

	for model, pricing := range knownModels {
		if err := p.UpsertPricing(ctx, "openai", model, pricing.InputPrice, pricing.OutputPrice); err != nil {
			return err
		}
	}

	return nil
}

// UpdateAnthropicPricing fetches Anthropic pricing
func (p *PricingUpdater) UpdateAnthropicPricing(ctx context.Context) error {
	knownModels := map[string]struct {
		InputPrice  int
		OutputPrice int
	}{
		"claude-3-opus":   {1500, 7500}, // $15/$75 per 1M
		"claude-3-sonnet": {300, 1500},  // $3/$15 per 1M
		"claude-3-haiku":  {25, 125},    // $0.25/$1.25 per 1M
	}

	for model, pricing := range knownModels {
		if err := p.UpsertPricing(ctx, "anthropic", model, pricing.InputPrice, pricing.OutputPrice); err != nil {
			return err
		}
	}

	return nil
}

// UpdateGroqPricing fetches Groq pricing
func (p *PricingUpdater) UpdateGroqPricing(ctx context.Context) error {
	knownModels := map[string]struct {
		InputPrice  int
		OutputPrice int
	}{
		"llama-3-70b":  {59, 79}, // $0.59/$0.79 per 1M
		"mixtral-8x7b": {27, 27}, // $0.27/$0.27 per 1M
	}

	for model, pricing := range knownModels {
		if err := p.UpsertPricing(ctx, "groq", model, pricing.InputPrice, pricing.OutputPrice); err != nil {
			return err
		}
	}

	return nil
}

// UpdateCoherePricing fetches Cohere pricing
func (p *PricingUpdater) UpdateCoherePricing(ctx context.Context) error {
	knownModels := map[string]struct {
		InputPrice  int
		OutputPrice int
	}{
		"command":       {100, 200}, // $1/$2 per 1M
		"command-light": {50, 100},  // $0.50/$1 per 1M
	}

	for model, pricing := range knownModels {
		if err := p.UpsertPricing(ctx, "cohere", model, pricing.InputPrice, pricing.OutputPrice); err != nil {
			return err
		}
	}

	return nil
}

// UpsertPricing inserts or updates pricing for a model
func (p *PricingUpdater) UpsertPricing(ctx context.Context, provider, model string, inputPrice, outputPrice int) error {
	query := `
		INSERT INTO model_pricing (provider, model, input_price_per_million, output_price_per_million, effective_date)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (provider, model, effective_date)
		DO UPDATE SET
			input_price_per_million = $3,
			output_price_per_million = $4
	`

	_, err := p.db.ExecContext(ctx, query, provider, model, inputPrice, outputPrice)
	if err != nil {
		return fmt.Errorf("failed to upsert pricing for %s/%s: %w", provider, model, err)
	}

	logger.Debug("Updated pricing",
		zap.String("provider", provider),
		zap.String("model", model),
		zap.Int("input_price_cents", inputPrice),
		zap.Int("output_price_cents", outputPrice),
	)

	return nil
}

// GetCurrentPricing retrieves the latest pricing for a model
func (p *PricingUpdater) GetCurrentPricing(ctx context.Context, provider, model string) (inputPrice, outputPrice int, err error) {
	query := `
		SELECT input_price_per_million, output_price_per_million
		FROM model_pricing
		WHERE provider = $1 
		  AND model = $2
		  AND deprecated_date IS NULL
		ORDER BY effective_date DESC
		LIMIT 1
	`

	err = p.db.QueryRowContext(ctx, query, provider, model).Scan(&inputPrice, &outputPrice)
	if err == sql.ErrNoRows {
		return 0, 0, fmt.Errorf("no pricing found for %s/%s", provider, model)
	}
	if err != nil {
		return 0, 0, err
	}

	return inputPrice, outputPrice, nil
}
