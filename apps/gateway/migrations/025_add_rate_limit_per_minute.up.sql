-- Migration: Add rate_limit_per_minute column to api_configs
-- Created: 2025-11-30
-- Fixes: pq: column "rate_limit_per_minute" does not exist error

-- Add rate_limit_per_minute column
ALTER TABLE api_configs
ADD COLUMN IF NOT EXISTS rate_limit_per_minute INT NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN api_configs.rate_limit_per_minute IS 'Per-minute rate limit (0 = unlimited)';

-- Set default values for existing records based on rate_limit_per_second
-- This provides a reasonable default: per_second * 60 = per_minute
UPDATE api_configs 
SET rate_limit_per_minute = rate_limit_per_second * 60
WHERE rate_limit_per_minute = 0 AND rate_limit_per_second > 0;
