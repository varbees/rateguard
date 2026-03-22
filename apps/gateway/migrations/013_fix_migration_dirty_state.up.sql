-- Fix: Clean up dirty migration state from failed 002_add_indexes migration
-- This migration re-applies the valid indexes that failed due to NOW() function issue

-- Drop any partially created indexes from failed migration
DROP INDEX IF EXISTS idx_usage_recent;
DROP INDEX IF EXISTS idx_metrics_recent;

-- Ensure all valid indexes from 002_add_indexes exist
CREATE INDEX IF NOT EXISTS idx_usage_user_api_date ON api_usage(user_id, target_api, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_user_api_date ON api_metrics(user_id, target_api, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_user_success ON api_metrics(user_id, status_code) WHERE status_code >= 200 AND status_code < 300;
CREATE INDEX IF NOT EXISTS idx_metrics_user_errors ON api_metrics(user_id, status_code) WHERE status_code >= 400;
CREATE INDEX IF NOT EXISTS idx_api_configs_name_user ON api_configs(name, user_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_users_active_plan ON users(plan, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_usage_timestamp_brin ON api_usage USING brin(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp_brin ON api_metrics USING brin(timestamp);
