-- Migration 015: Add API Keys Table for Multiple Keys per User
-- This enables zero-downtime key rotation for production deployments

-- Create api_keys table for multiple keys per user
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_name VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    
    CONSTRAINT unique_user_key_name UNIQUE(user_id, key_name)
);

-- Indexes for performance
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key ON api_keys(api_key) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_user_active ON api_keys(user_id) WHERE revoked_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE api_keys IS 'Multiple API keys per user for zero-downtime rotation';
COMMENT ON COLUMN api_keys.revoked_at IS 'NULL = active, timestamp = revoked and no longer valid';
COMMENT ON COLUMN api_keys.last_used_at IS 'Updated asynchronously on auth, used for identifying stale keys';

-- Migrate existing users.api_key to api_keys table
-- Only migrate non-empty keys
INSERT INTO api_keys (user_id, key_name, api_key, created_at)
SELECT id, 'Primary Key', api_key, created_at
FROM users
WHERE api_key IS NOT NULL AND api_key != '';

-- DO NOT DROP users.api_key column yet (used by the current rollout)
-- This allows safe rollback if needed
-- Future migration (016) will remove it after full deployment verification
