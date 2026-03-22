-- Migration rollback: Remove rate_limit_per_minute column from api_configs
-- Created: 2025-11-30

ALTER TABLE api_configs
DROP COLUMN IF EXISTS rate_limit_per_minute;
