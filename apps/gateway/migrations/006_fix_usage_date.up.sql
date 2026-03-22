-- Migration: Fix api_usage table to add usage_date column
-- This fixes the ON CONFLICT issue in RecordRequest

-- Add usage_date column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='api_usage' AND column_name='usage_date'
    ) THEN
        -- Add usage_date column
        ALTER TABLE api_usage ADD COLUMN usage_date DATE;
        
        -- Populate existing rows
        UPDATE api_usage SET usage_date = DATE(timestamp);
        
        -- Make it NOT NULL after population
        ALTER TABLE api_usage ALTER COLUMN usage_date SET NOT NULL;
        
        -- Set default for future inserts
        ALTER TABLE api_usage ALTER COLUMN usage_date SET DEFAULT CURRENT_DATE;
        
        -- Add unique constraint
        ALTER TABLE api_usage ADD CONSTRAINT unique_user_api_date UNIQUE (user_id, target_api, usage_date);
        
        -- Update index to use usage_date
        DROP INDEX IF EXISTS idx_usage_user_date;
        CREATE INDEX idx_usage_user_date ON api_usage(user_id, usage_date DESC);
    END IF;
END $$;
