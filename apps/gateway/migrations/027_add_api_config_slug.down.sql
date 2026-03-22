-- Rollback migration 027: Remove API config slug field

-- Remove constraints
ALTER TABLE api_configs DROP CONSTRAINT IF EXISTS check_slug_format;
ALTER TABLE api_configs DROP CONSTRAINT IF EXISTS unique_user_api_slug;

-- Drop index
DROP INDEX IF EXISTS idx_api_configs_slug;

-- Drop column
ALTER TABLE api_configs DROP COLUMN IF EXISTS slug;
