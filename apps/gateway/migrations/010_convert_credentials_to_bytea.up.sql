-- Migration: Convert auth_credentials from JSONB to BYTEA for encrypted storage
-- This ensures credentials are stored as encrypted binary data, not as JSON

-- Step 1: Add new BYTEA column
ALTER TABLE api_configs ADD COLUMN auth_credentials_encrypted BYTEA;

-- Step 2: Migrate existing data (if encryption was already in use)
-- This copies the JSON string representation to BYTEA
-- Note: This is a data migration - encrypted base64 strings will remain encrypted
UPDATE api_configs 
SET auth_credentials_encrypted = auth_credentials::text::bytea
WHERE auth_credentials IS NOT NULL AND auth_credentials::text != '{}'::text;

-- Step 3: Drop old JSONB column
ALTER TABLE api_configs DROP COLUMN auth_credentials;

-- Step 4: Rename new column to original name
ALTER TABLE api_configs RENAME COLUMN auth_credentials_encrypted TO auth_credentials;

-- Step 5: Set default to empty bytea
ALTER TABLE api_configs ALTER COLUMN auth_credentials SET DEFAULT '\x'::bytea;

-- Add comment for documentation
COMMENT ON COLUMN api_configs.auth_credentials IS 'Encrypted authentication credentials stored as binary data (AES-256-GCM). Contains serialized, encrypted JSON of credential map. MUST be encrypted in production.';
