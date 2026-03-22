DROP INDEX IF EXISTS idx_users_country;

ALTER TABLE users DROP COLUMN IF EXISTS detected_currency;
ALTER TABLE users DROP COLUMN IF EXISTS country_code;
