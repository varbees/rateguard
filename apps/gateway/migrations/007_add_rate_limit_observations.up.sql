-- Rate limit observations table
CREATE TABLE IF NOT EXISTS rate_limit_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_id UUID NOT NULL REFERENCES api_configs(id) ON DELETE CASCADE,
    
    -- Observed limits
    limit_per_window BIGINT,
    window_seconds INT,
    reset_timestamp TIMESTAMPTZ,
    retry_after_seconds INT,
    
    -- Metadata
    source_header VARCHAR(100) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_status INT NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_rate_limit_obs_api ON rate_limit_observations(api_id, observed_at DESC);
CREATE INDEX idx_rate_limit_obs_user ON rate_limit_observations(user_id, observed_at DESC);
CREATE INDEX idx_rate_limit_obs_created ON rate_limit_observations(created_at DESC);

-- Comments
COMMENT ON TABLE rate_limit_observations IS 'Stores observed rate limit information from API 429 responses';
COMMENT ON COLUMN rate_limit_observations.source_header IS 'Header that provided rate limit info (e.g., X-RateLimit-Limit)';
COMMENT ON COLUMN rate_limit_observations.limit_per_window IS 'Observed request limit per time window';
COMMENT ON COLUMN rate_limit_observations.window_seconds IS 'Time window in seconds (e.g., 60 for per-minute)';
