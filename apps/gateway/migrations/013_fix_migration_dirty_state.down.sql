-- Rollback: Remove indexes created by dirty state fix
DROP INDEX IF EXISTS idx_usage_user_api_date;
DROP INDEX IF EXISTS idx_metrics_user_api_date;
DROP INDEX IF EXISTS idx_metrics_user_success;
DROP INDEX IF EXISTS idx_metrics_user_errors;
DROP INDEX IF EXISTS idx_api_configs_name_user;
DROP INDEX IF EXISTS idx_users_active_plan;
DROP INDEX IF EXISTS idx_usage_timestamp_brin;
DROP INDEX IF EXISTS idx_metrics_timestamp_brin;
