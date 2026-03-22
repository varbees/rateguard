-- Add password and authentication fields to users table
-- Migration 004: Authentication Enhancement

-- Add password_hash field for secure password storage
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add password reset fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- Add email verification fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);

-- Add last login tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Update existing test user to have a password
-- Password: "password123" (bcrypt hash)
UPDATE users 
SET password_hash = '$2a$10$rN7/MdZ3QqVz7mYHZvYP5eJ6oOq0d8qJ7K4XfW3LVzXHZvYP5eJ6o'
WHERE email = 'test@example.com';

COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.reset_token IS 'Token for password reset, expires after use';
COMMENT ON COLUMN users.reset_token_expires IS 'Expiration timestamp for reset token';
COMMENT ON COLUMN users.email_verified IS 'Whether user has verified their email address';
COMMENT ON COLUMN users.verification_token IS 'Token for email verification';
COMMENT ON COLUMN users.last_login_at IS 'Timestamp of last successful login';
