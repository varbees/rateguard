-- Migration 028: Add marketplace template library system
-- This enables public template URLs like /p/openai/v1/chat/completions

-- =======================
-- 1. API Templates Table
-- =======================
CREATE TABLE IF NOT EXISTS api_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(100) NOT NULL UNIQUE,          -- URL-safe provider name (e.g., 'openai', 'stripe')
    display_name VARCHAR(255) NOT NULL,             -- Human-readable name (e.g., 'OpenAI GPT')
    description TEXT,                               -- Template description
    icon_url VARCHAR(512),                          -- Optional icon/logo URL
    category VARCHAR(50),                           -- Category for filtering ('ai', 'payments', etc.)
    
    -- Template configuration
    target_url VARCHAR(1024) NOT NULL,              -- Base API URL (e.g., 'https://api.openai.com')
    auth_type VARCHAR(50) DEFAULT 'bearer',         -- Auth method ('bearer', 'api_key', 'custom')
    required_headers JSONB DEFAULT '{}',            -- Default headers to inject
    
    -- Rate limiting (default limits for template usage)
    rate_limit_per_second INT DEFAULT 1,
    burst_size INT DEFAULT 5,
    
    -- Metadata
    popularity_score INT DEFAULT 0,                 -- For sorting templates
    is_active BOOLEAN DEFAULT true,                 -- Enable/disable template
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add constraint for provider format (using DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_provider_format'
    ) THEN
        ALTER TABLE api_templates ADD CONSTRAINT check_provider_format 
        CHECK (provider ~ '^[a-z0-9_-]{3,30}$');
    END IF;
END $$;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_templates_provider ON api_templates(provider);
CREATE INDEX IF NOT EXISTS idx_api_templates_category ON api_templates(category);
CREATE INDEX IF NOT EXISTS idx_api_templates_active ON api_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_api_templates_popularity ON api_templates(popularity_score DESC);

-- Updated timestamp trigger
CREATE TRIGGER update_api_templates_updated_at BEFORE UPDATE ON api_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================
-- 2. Reserved Handles Table
-- ============================
CREATE TABLE IF NOT EXISTS reserved_handles (
    handle VARCHAR(30) PRIMARY KEY,
    reason TEXT NOT NULL,                           -- Why this handle is reserved
    reserved_at TIMESTAMP DEFAULT NOW()
);

-- Seed with system reserved handles
INSERT INTO reserved_handles (handle, reason) VALUES
-- System routes
('admin', 'System: Admin routes'),
('api', 'System: API routes'),
('docs', 'System: Documentation'),
('support', 'System: Support pages'),
('billing', 'System: Billing routes'),
('webhook', 'System: Webhook routes'),
('health', 'System: Health checks'),
('metrics', 'System: Metrics'),
('status', 'System: Status page'),

-- Legal/Marketing pages
('about', 'Marketing: About page'),
('contact', 'Marketing: Contact'),
('legal', 'Marketing: Legal'),
('terms', 'Marketing: Terms of service'),
('privacy', 'Marketing: Privacy policy'),
('pricing', 'Marketing: Pricing page'),
('blog', 'Marketing: Blog'),

-- Avoid confusion
('public', 'Reserved: Avoid confusion'),
('shared', 'Reserved: Avoid confusion'),
('demo', 'Reserved: Avoid confusion'),
('test', 'Reserved: Avoid confusion'),
('staging', 'Reserved: Avoid confusion'),
('prod', 'Reserved: Avoid confusion'),
('marketplace', 'Reserved: Future use'),
('templates', 'Reserved: Future use')
ON CONFLICT (handle) DO NOTHING;

-- Function to auto-reserve provider handles when template is created
CREATE OR REPLACE FUNCTION reserve_template_provider()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO reserved_handles (handle, reason)
    VALUES (NEW.provider, 'Template: ' || NEW.display_name)
    ON CONFLICT (handle) DO UPDATE 
    SET reason = 'Template: ' || NEW.display_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-reserve provider handles
CREATE TRIGGER auto_reserve_provider_handle
AFTER INSERT OR UPDATE ON api_templates
FOR EACH ROW
EXECUTE FUNCTION reserve_template_provider();

-- ================================
-- 3. Template Usage Tracking
-- ================================
CREATE TABLE IF NOT EXISTS template_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_provider VARCHAR(100) NOT NULL,       -- Provider name (e.g., 'openai')
    requests BIGINT DEFAULT 0,                      -- Request count
    usage_date DATE DEFAULT CURRENT_DATE,
    
    UNIQUE(user_id, template_provider, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_template_usage_user ON template_usage(user_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_template_usage_provider ON template_usage(template_provider);

-- =======================
-- 4. Seed Popular Templates
-- =======================
INSERT INTO api_templates (provider, display_name, description, target_url, category, popularity_score, auth_type) VALUES
('openai', 'OpenAI GPT', 'ChatGPT, GPT-4, and DALL-E models with function calling', 'https://api.openai.com', 'ai', 100, 'bearer'),
('anthropic', 'Claude AI', 'Anthropic Claude models with 200K context window', 'https://api.anthropic.com', 'ai', 90, 'custom'),
('stripe', 'Stripe Payments', 'Payment processing and subscription management', 'https://api.stripe.com', 'payments', 80, 'bearer'),
('github', 'GitHub API', 'Repository, user, and organization data access', 'https://api.github.com', 'developer', 70, 'bearer'),
('sendgrid', 'SendGrid', 'Email delivery and marketing campaigns', 'https://api.sendgrid.com', 'communication', 60, 'bearer'),
('twilio', 'Twilio', 'SMS, voice, and video communication', 'https://api.twilio.com', 'communication', 55, 'custom'),
('slack', 'Slack', 'Team messaging and workspace automation', 'https://slack.com/api', 'communication', 50, 'bearer'),
('discord', 'Discord', 'Community chat and bot development', 'https://discord.com/api', 'communication', 45, 'bearer')
ON CONFLICT (provider) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE api_templates IS 'Public marketplace template library for instant API integrations';
COMMENT ON TABLE reserved_handles IS 'Handles that cannot be claimed by users (system routes, templates, etc.)';
COMMENT ON TABLE template_usage IS 'Tracks user usage of marketplace templates for analytics';
