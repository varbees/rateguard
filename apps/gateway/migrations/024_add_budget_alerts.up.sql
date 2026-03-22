-- Budget configuration per user
CREATE TABLE IF NOT EXISTS budget_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Budget limits
    monthly_budget_cents INT NOT NULL, -- e.g., 500000 = $5,000
    alert_threshold_pct INT NOT NULL DEFAULT 90, -- Alert at 90%
    hard_limit_pct INT NOT NULL DEFAULT 110, -- Hard stop at 110%
    
    -- Notification settings
    notify_email BOOLEAN DEFAULT TRUE,
    notify_webhook BOOLEAN DEFAULT FALSE,
    webhook_url TEXT,
    
    -- Status
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_user_budget UNIQUE(user_id),
    CONSTRAINT valid_budget_amount CHECK (monthly_budget_cents > 0),
    CONSTRAINT valid_thresholds CHECK (alert_threshold_pct > 0 AND alert_threshold_pct <= 100 AND hard_limit_pct > alert_threshold_pct)
);

-- Budget alerts tracking
CREATE TABLE IF NOT EXISTS budget_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    budget_config_id UUID NOT NULL REFERENCES budget_configs(id) ON DELETE CASCADE,
    
    -- Alert details
    alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('threshold', 'hard_limit', 'optimization')),
    threshold_pct INT NOT NULL,
    current_spend_cents INT NOT NULL,
    budget_cents INT NOT NULL,
    
    -- Optimization suggestions (JSON)
    suggestions JSONB,
    
    -- Status
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_configs_user ON budget_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_configs_enabled ON budget_configs(enabled) WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_budget_alerts_user ON budget_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_unacknowledged ON budget_alerts(user_id, acknowledged) WHERE NOT acknowledged;
CREATE INDEX IF NOT EXISTS idx_budget_alerts_config ON budget_alerts(budget_config_id);

-- Trigger for updated_at
CREATE TRIGGER update_budget_configs_updated_at BEFORE UPDATE ON budget_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE budget_configs IS 'User budget configuration for cost alerts';
COMMENT ON TABLE budget_alerts IS 'Historical budget alert notifications';
COMMENT ON COLUMN budget_alerts.suggestions IS 'JSON array of optimization suggestions: {"type": "model_switch", "savings": 600, "description": "Switch from GPT-4 to GPT-3.5"}';
