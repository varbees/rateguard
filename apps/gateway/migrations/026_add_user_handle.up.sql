-- Migration 026: Add user handle/slug field
-- This enables user-friendly URLs like /p/:username/:projectslug

-- Add handle column to users table (nullable initially during rollout)
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle VARCHAR(30);

-- Add unique constraint (using DO block for IF NOT EXISTS behavior)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_handle_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_handle_key UNIQUE (handle);
    END IF;
END $$;

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);

-- Add constraint for valid handle format (using DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_handle_format'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT check_handle_format 
        CHECK (handle IS NULL OR handle ~ '^[a-z0-9_-]{3,30}$');
    END IF;
END $$;

-- Backfill existing users with safe, unique handles based on creation timestamp
-- Format: user{timestamp} to avoid collisions
UPDATE users 
SET handle = CONCAT('user', LPAD(CAST(EXTRACT(EPOCH FROM created_at) AS TEXT), 10, '0'))
WHERE handle IS NULL;

-- Now make handle NOT NULL after backfill
ALTER TABLE users ALTER COLUMN handle SET NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN users.handle IS 'User-friendly handle for URL routing (e.g., /p/johndoe/...). Must be unique and follow slug format.';
