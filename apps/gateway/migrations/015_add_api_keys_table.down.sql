-- Rollback Migration 015: Remove API Keys Table
-- This is a safe rollback - users.api_key column is preserved

-- Drop api_keys table and all related objects
DROP TABLE IF EXISTS api_keys CASCADE;

-- Note: users.api_key column remains intact
-- All existing API keys continue to work via the old single-key system
