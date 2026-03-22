-- Migration 032: Add expiration for email verification tokens

ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;

-- Create index for cleanup/lookup
CREATE INDEX IF NOT EXISTS idx_users_verification_token_expires ON users(verification_token_expires);

COMMENT ON COLUMN users.verification_token_expires IS 'Expiration timestamp for email verification token';
