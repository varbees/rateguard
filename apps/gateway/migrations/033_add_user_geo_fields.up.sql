-- Restore the user geo columns expected by auth, billing, and settings flows.
-- The live database snapshot is missing these fields even though the application
-- code and API contracts already depend on them.

ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS detected_currency VARCHAR(3) DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_users_country ON users(country_code);

COMMENT ON COLUMN users.country_code IS 'ISO 3166-1 alpha-2 country code for pricing detection';
COMMENT ON COLUMN users.detected_currency IS 'Currency based on country (INR for India, USD for others)';
