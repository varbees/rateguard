-- Additional performance indexes for RateGuard

-- Composite indexes for common query patterns

-- Usage analytics queries (by user, date range, API)
CREATE INDEX idx_usage_user_api_date ON api_usage(user_id, target_api, timestamp DESC);

-- Metrics analytics queries
CREATE INDEX idx_metrics_user_api_date ON api_metrics(user_id, target_api, timestamp DESC);
CREATE INDEX idx_metrics_user_success ON api_metrics(user_id, status_code) WHERE status_code >= 200 AND status_code < 300;
CREATE INDEX idx_metrics_user_errors ON api_metrics(user_id, status_code) WHERE status_code >= 400;

-- API config lookups (for proxy routing)
CREATE INDEX idx_api_configs_name_user ON api_configs(name, user_id) WHERE enabled = true;

-- Recent activity queries (removed NOW() from WHERE clause - functions must be IMMUTABLE in index predicates)
-- Use simple timestamp DESC indexes instead for recent queries
-- Application layer can handle the date filtering

-- Plan-based queries
CREATE INDEX idx_users_active_plan ON users(plan, active) WHERE active = true;

-- Add BRIN indexes for time-series data (more efficient for large datasets)
CREATE INDEX idx_usage_timestamp_brin ON api_usage USING brin(timestamp);
CREATE INDEX idx_metrics_timestamp_brin ON api_metrics USING brin(timestamp);
