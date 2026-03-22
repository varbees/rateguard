-- RateGuard Database Schema
-- This schema supports multi-tenant SaaS architecture with user isolation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table: Core user/account management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_api_key ON users(api_key);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);

-- API configurations: User-defined APIs to proxy
CREATE TABLE api_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    target_url VARCHAR(1024) NOT NULL,
    rate_limit_per_second INT NOT NULL DEFAULT 10,
    burst_size INT NOT NULL DEFAULT 20,
    enabled BOOLEAN NOT NULL DEFAULT true,
    custom_headers JSONB DEFAULT '{}',
    auth_type VARCHAR(50) NOT NULL DEFAULT 'none',
    auth_credentials JSONB DEFAULT '{}',
    timeout_seconds INT NOT NULL DEFAULT 30,
    retry_attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_api_name UNIQUE(user_id, name)
);

CREATE INDEX idx_api_configs_user ON api_configs(user_id);
CREATE INDEX idx_api_configs_enabled ON api_configs(enabled);
CREATE INDEX idx_api_configs_user_enabled ON api_configs(user_id, enabled);

-- Usage tracking: Request counts for billing (daily aggregation)
CREATE TABLE api_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_api VARCHAR(255) NOT NULL,
    requests BIGINT NOT NULL DEFAULT 0,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, target_api, usage_date)  -- Daily aggregation constraint
);

CREATE INDEX idx_usage_user_date ON api_usage(user_id, usage_date DESC);
CREATE INDEX idx_usage_api ON api_usage(target_api);
CREATE INDEX idx_usage_timestamp ON api_usage(timestamp DESC);

-- Metrics: Performance tracking
CREATE TABLE api_metrics (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_api VARCHAR(255) NOT NULL,
    status_code INT NOT NULL,
    duration_ms BIGINT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metrics_user_date ON api_metrics(user_id, timestamp DESC);
CREATE INDEX idx_metrics_status ON api_metrics(status_code);
CREATE INDEX idx_metrics_api ON api_metrics(target_api);
CREATE INDEX idx_metrics_timestamp ON api_metrics(timestamp DESC);

-- Subscriptions: Billing information
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_subscription UNIQUE(user_id)
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_configs_updated_at BEFORE UPDATE ON api_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user for testing (API key: test_key_admin_12345678901234567890123456789012)
INSERT INTO users (email, api_key, plan, active) VALUES
    ('admin@rateguard.dev', 'test_key_admin_12345678901234567890123456789012', 'enterprise', true);

-- Comments for documentation
COMMENT ON TABLE users IS 'RateGuard user accounts with plan-based access control';
COMMENT ON TABLE api_configs IS 'User-configured API endpoints to proxy through RateGuard';
COMMENT ON TABLE api_usage IS 'Request count tracking for billing and analytics';
COMMENT ON TABLE api_metrics IS 'Detailed performance metrics for each proxied request';
COMMENT ON TABLE subscriptions IS 'Stripe billing subscription information';
