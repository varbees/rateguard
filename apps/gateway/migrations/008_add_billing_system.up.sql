-- RateGuard Billing System
-- Stripe + Razorpay hybrid approach for global + India market
-- Philosophy: 37signals shaped, India-first pricing, production-grade

-- Subscriptions table: Core subscription management
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Plan details
    plan_tier VARCHAR(20) NOT NULL CHECK (plan_tier IN ('free', 'pro', 'business')),
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
    
    -- Pricing (stored in minor units: cents/paise)
    amount_minor_units INT NOT NULL, -- 49900 paise or 1900 cents
    currency VARCHAR(3) NOT NULL, -- 'INR' or 'USD'
    
    -- Payment gateway
    payment_provider VARCHAR(20) NOT NULL CHECK (payment_provider IN ('stripe', 'razorpay', 'manual')),
    external_subscription_id VARCHAR(255), -- Stripe/Razorpay subscription ID
    external_customer_id VARCHAR(255), -- Stripe/Razorpay customer ID
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trial')),
    trial_ends_at TIMESTAMP,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    canceled_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_user_subscription UNIQUE(user_id)
);

-- Invoices table: Billing history and payment tracking
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Invoice details
    amount_minor_units INT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
    
    -- Payment gateway
    payment_provider VARCHAR(20) NOT NULL,
    external_invoice_id VARCHAR(255),
    hosted_invoice_url TEXT, -- Stripe/Razorpay hosted page
    invoice_pdf_url TEXT,
    
    -- Timestamps
    due_date TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Payment methods table: Stored payment information
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Payment provider
    payment_provider VARCHAR(20) NOT NULL,
    external_payment_method_id VARCHAR(255) NOT NULL,
    
    -- Card/payment details
    type VARCHAR(20) NOT NULL, -- 'card', 'upi', 'netbanking'
    last4 VARCHAR(4),
    brand VARCHAR(50), -- 'visa', 'mastercard', 'upi'
    exp_month INT,
    exp_year INT,
    
    -- Status
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Coupons table: Discount codes and promotions
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    
    -- Discount
    percent_off INT CHECK (percent_off BETWEEN 1 AND 100),
    amount_off_minor_units INT,
    currency VARCHAR(3),
    
    -- Validity
    valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMP,
    max_redemptions INT,
    times_redeemed INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Coupon redemptions: Track which users used which coupons
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_coupon_subscription UNIQUE(coupon_id, subscription_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(payment_provider);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);

CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(user_id, is_default);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_valid ON coupons(valid_from, valid_until);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);

-- Add country and currency detection to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS detected_currency VARCHAR(3) DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_users_country ON users(country_code);

-- Triggers for updated_at (only create if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_subscriptions_updated_at') THEN
        CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_coupons_updated_at') THEN
        CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE subscriptions IS 'User subscription plans with Stripe/Razorpay integration';
COMMENT ON TABLE invoices IS 'Billing history and invoice tracking';
COMMENT ON TABLE payment_methods IS 'Stored payment methods for recurring billing';
COMMENT ON TABLE coupons IS 'Discount codes and promotional offers';
COMMENT ON TABLE coupon_redemptions IS 'Tracks which users redeemed which coupons';

COMMENT ON COLUMN subscriptions.amount_minor_units IS 'Amount in smallest currency unit (cents/paise). 1900 = $19.00 or 49900 = ₹499.00';
COMMENT ON COLUMN subscriptions.payment_provider IS 'stripe for global, razorpay for India, manual for enterprise';
COMMENT ON COLUMN users.country_code IS 'ISO 3166-1 alpha-2 country code for pricing detection';
COMMENT ON COLUMN users.detected_currency IS 'Currency based on country (INR for India, USD for others)';
