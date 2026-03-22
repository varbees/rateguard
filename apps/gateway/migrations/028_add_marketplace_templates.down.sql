-- Rollback migration 028: Remove marketplace template system

-- Drop triggers
DROP TRIGGER IF EXISTS auto_reserve_provider_handle ON api_templates;
DROP TRIGGER IF EXISTS update_api_templates_updated_at ON api_templates;

-- Drop functions
DROP FUNCTION IF EXISTS reserve_template_provider();

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS template_usage;
DROP TABLE IF EXISTS reserved_handles;
DROP TABLE IF EXISTS api_templates;
