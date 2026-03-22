-- Migration 027: Add project slug to api_configs
-- This enables project-specific URLs like /p/:username/:projectslug

-- Add slug column (nullable initially during rollout)
ALTER TABLE api_configs ADD COLUMN IF NOT EXISTS slug VARCHAR(30);

-- Add unique constraint for slug within user's namespace (using DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_api_slug'
    ) THEN
        ALTER TABLE api_configs ADD CONSTRAINT unique_user_api_slug UNIQUE(user_id, slug);
    END IF;
END $$;

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_configs_slug ON api_configs(user_id, slug);

-- Add constraint for valid slug format (using DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_slug_format'
    ) THEN
        ALTER TABLE api_configs ADD CONSTRAINT check_slug_format 
        CHECK (slug IS NULL OR slug ~ '^[a-z0-9_-]{3,30}$');
    END IF;
END $$;

-- Backfill existing API configs with slugs derived from their names
-- Convert to lowercase, replace non-alphanumeric with hyphens, remove consecutive hyphens
UPDATE api_configs 
SET slug = LOWER(
    REGEXP_REPLACE(
        REGEXP_REPLACE(name, '[^a-zA-Z0-9_-]+', '-', 'g'),
        '-+', '-', 'g'
    )
)
WHERE slug IS NULL;

-- Handle potential slug collisions after backfill by appending numbers
-- This ensures uniqueness within each user's namespace
DO $$
DECLARE
    conflict_record RECORD;
    new_slug VARCHAR(30);
    counter INT;
BEGIN
    -- Find duplicate slugs within same user
    FOR conflict_record IN 
        SELECT user_id, slug, array_agg(id) as ids
        FROM api_configs
        WHERE slug IS NOT NULL
        GROUP BY user_id, slug
        HAVING COUNT(*) > 1
    LOOP
        -- Keep first one, rename others
        counter := 1;
        FOREACH new_slug IN ARRAY conflict_record.ids[2:array_length(conflict_record.ids, 1)]
        LOOP
            UPDATE api_configs 
            SET slug = CONCAT(conflict_record.slug, '-', counter)
            WHERE id = new_slug::uuid;
            counter := counter + 1;
        END LOOP;
    END LOOP;
END $$;

-- Now make slug NOT NULL after backfill and collision resolution
ALTER TABLE api_configs ALTER COLUMN slug SET NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN api_configs.slug IS 'Project slug for URL routing (e.g., /p/username/myproject/...). Unique within user namespace.';
