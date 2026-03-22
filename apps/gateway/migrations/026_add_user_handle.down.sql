-- Rollback migration 026: Remove user handle field

-- Remove constraint first
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_handle_format;

-- Drop index
DROP INDEX IF EXISTS idx_users_handle;

-- Drop column
ALTER TABLE users DROP COLUMN IF EXISTS handle;
