-- Rollback migration: Remove LLM token tracking and pricing system

-- Drop indexes
DROP INDEX IF EXISTS idx_metrics_llm_apis;
DROP INDEX IF EXISTS idx_metrics_model;
DROP INDEX IF EXISTS idx_metrics_tokens;
DROP INDEX IF EXISTS idx_model_pricing_lookup;

-- Drop model pricing table
DROP TABLE IF EXISTS model_pricing;

-- Remove columns from api_usage
ALTER TABLE api_usage
    DROP COLUMN IF EXISTS total_cost_cents,
    DROP COLUMN IF EXISTS total_tokens;

-- Remove columns from api_metrics
ALTER TABLE api_metrics
    DROP COLUMN IF EXISTS estimated_cost_cents,
    DROP COLUMN IF EXISTS model_used,
    DROP COLUMN IF EXISTS total_tokens,
    DROP COLUMN IF EXISTS output_tokens,
    DROP COLUMN IF EXISTS input_tokens;

-- Remove columns from api_configs
ALTER TABLE api_configs
    DROP COLUMN IF EXISTS pricing_model,
    DROP COLUMN IF EXISTS is_llm_api,
    DROP COLUMN IF EXISTS model,
    DROP COLUMN IF EXISTS provider;
