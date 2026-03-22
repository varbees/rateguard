-- Add analytics retention column to api_usage
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS retention_days INT DEFAULT 7;

-- Update retention based on user plan
UPDATE api_usage u
SET retention_days = CASE 
    WHEN EXISTS (
        SELECT 1 FROM subscriptions s 
        WHERE s.user_id = u.user_id 
          AND s.status = 'active' 
          AND s.plan_tier = 'pro'
    ) THEN 90
    WHEN EXISTS (
        SELECT 1 FROM subscriptions s 
        WHERE s.user_id = u.user_id 
          AND s.status = 'active' 
          AND s.plan_tier = 'starter'
    ) THEN 30
    ELSE 7
END;

-- Create index for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_api_usage_cleanup ON api_usage(usage_date, retention_days);

-- Add comment
COMMENT ON COLUMN api_usage.retention_days IS 'Number of days to retain this usage data based on user plan';
