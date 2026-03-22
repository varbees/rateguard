-- Update plan tiers to match new pricing model (Free, Starter, Pro)
-- Old: free, pro, business
-- New: free, starter, pro

-- Drop existing check constraint
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;

-- Update existing data
-- 1. Old 'pro' ($19) becomes 'starter' ($29) - closest match for indie devs
UPDATE subscriptions SET plan_tier = 'starter' WHERE plan_tier = 'pro';

-- 2. Old 'business' ($59) becomes 'pro' ($79) - closest match for startups
UPDATE subscriptions SET plan_tier = 'pro' WHERE plan_tier = 'business';

-- Add new check constraint
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_tier_check 
    CHECK (plan_tier IN ('free', 'starter', 'pro'));
