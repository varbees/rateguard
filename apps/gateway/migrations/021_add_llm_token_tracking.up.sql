-- Migration: Add LLM token tracking and intelligent pricing system
-- This migration adds support for tracking LLM token usage and model-specific pricing

-- Add LLM provider/model info to api_configs
ALTER TABLE api_configs
    ADD COLUMN IF NOT EXISTS provider VARCHAR(50),       -- 'openai', 'anthropic', 'groq'
    ADD COLUMN IF NOT EXISTS model VARCHAR(100),         -- 'gpt-4', 'claude-3', etc.
    ADD COLUMN IF NOT EXISTS is_llm_api BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(20) DEFAULT 'request'; -- 'request' or 'token'

-- Add token tracking to api_metrics
ALTER TABLE api_metrics
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS model_used VARCHAR(100),
    ADD COLUMN IF NOT EXISTS estimated_cost_cents INT DEFAULT 0; -- Store in cents for precision

-- Add token aggregation to api_usage
ALTER TABLE api_usage
    ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_cost_cents INT DEFAULT 0;

-- Create index for token-based queries (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_metrics_tokens ON api_metrics(user_id, total_tokens) WHERE total_tokens > 0;
CREATE INDEX IF NOT EXISTS idx_metrics_model ON api_metrics(model_used, timestamp DESC) WHERE model_used IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_metrics_llm_apis ON api_metrics(user_id, timestamp DESC) WHERE is_streaming = true;

-- Create model pricing lookup table (for intelligent, versioned pricing)
CREATE TABLE IF NOT EXISTS model_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,      -- 'openai', 'anthropic', 'groq'
    model VARCHAR(100) NOT NULL,        -- 'gpt-4-turbo', 'claude-3-opus'
    input_price_per_million INT NOT NULL,  -- cents per 1M tokens
    output_price_per_million INT NOT NULL, -- cents per 1M tokens
    effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
    deprecated_date TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(provider, model, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_lookup ON model_pricing(provider, model, effective_date DESC) WHERE deprecated_date IS NULL;

-- Seed initial pricing (based on January 2025 rates)
INSERT INTO model_pricing (provider, model, input_price_per_million, output_price_per_million) VALUES
    -- OpenAI Models
    ('openai', 'gpt-4-turbo', 1000, 3000),        -- $10/$30 per 1M tokens
    ('openai', 'gpt-4', 3000, 6000),              -- $30/$60 per 1M tokens
    ('openai', 'gpt-3.5-turbo', 50, 150),         -- $0.50/$1.50 per 1M tokens
    ('openai', 'gpt-4o', 500, 1500),              -- $5/$15 per 1M tokens
    
    -- Anthropic Models
    ('anthropic', 'claude-3-opus', 1500, 7500),   -- $15/$75 per 1M tokens
    ('anthropic', 'claude-3-sonnet', 300, 1500),  -- $3/$15 per 1M tokens
    ('anthropic', 'claude-3-haiku', 25, 125),     -- $0.25/$1.25 per 1M tokens
    
    -- Groq Models
    ('groq', 'llama-3-70b', 59, 79),              -- $0.59/$0.79 per 1M tokens
    ('groq', 'mixtral-8x7b', 27, 27),             -- $0.27/$0.27 per 1M tokens
    
    -- Cohere Models
    ('cohere', 'command', 100, 200),              -- $1/$2 per 1M tokens
    ('cohere', 'command-light', 50, 100)          -- $0.50/$1 per 1M tokens
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- Add column comments for documentation
COMMENT ON COLUMN api_configs.is_llm_api IS 'Whether this API is an LLM endpoint requiring token tracking';
COMMENT ON COLUMN api_configs.provider IS 'LLM provider: openai, anthropic, groq, cohere';
COMMENT ON COLUMN api_configs.model IS 'Specific model name for accurate pricing';
COMMENT ON COLUMN api_configs.pricing_model IS 'Pricing strategy: request (per-request) or token (per-token for LLMs)';

COMMENT ON COLUMN api_metrics.input_tokens IS 'Number of input tokens (prompt) for LLM requests';
COMMENT ON COLUMN api_metrics.output_tokens IS 'Number of output tokens (completion) for LLM requests';
COMMENT ON COLUMN api_metrics.total_tokens IS 'Total tokens (input + output) for LLM requests';
COMMENT ON COLUMN api_metrics.model_used IS 'Model used for this request (may differ from configured model)';
COMMENT ON COLUMN api_metrics.estimated_cost_cents IS 'Estimated cost in cents based on token usage and pricing';

COMMENT ON COLUMN api_usage.total_tokens IS 'Total tokens used for this API on this date';
COMMENT ON COLUMN api_usage.total_cost_cents IS 'Total estimated cost in cents for this API on this date';

COMMENT ON TABLE model_pricing IS 'LLM model pricing lookup table (cents per 1M tokens) with versioning support';
COMMENT ON COLUMN model_pricing.effective_date IS 'When this pricing becomes effective (allows historical cost reporting)';
COMMENT ON COLUMN model_pricing.deprecated_date IS 'When this pricing was superseded (NULL = current pricing)';
