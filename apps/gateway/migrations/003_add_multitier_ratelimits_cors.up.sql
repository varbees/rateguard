-- Migration: Add multi-tier rate limits and CORS whitelist to API configs
-- Created: 2024-11-22

-- Add new columns to api_configs table
ALTER TABLE api_configs
ADD COLUMN IF NOT EXISTS rate_limit_per_hour INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rate_limit_per_day INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rate_limit_per_month INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS allowed_origins JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN api_configs.rate_limit_per_hour IS 'Hourly rate limit (0 = unlimited)';
COMMENT ON COLUMN api_configs.rate_limit_per_day IS 'Daily rate limit (0 = unlimited)';
COMMENT ON COLUMN api_configs.rate_limit_per_month IS 'Monthly rate limit (0 = unlimited)';
COMMENT ON COLUMN api_configs.allowed_origins IS 'CORS whitelist - array of allowed origins';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_configs_rate_limits ON api_configs(rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month);

-- Example: Set default values for existing records based on plan
-- This is optional - adjust based on your business logic
UPDATE api_configs SET
    rate_limit_per_hour = rate_limit_per_second * 3600,
    rate_limit_per_day = rate_limit_per_second * 86400,
    rate_limit_per_month = rate_limit_per_second * 2592000
WHERE rate_limit_per_hour = 0;
