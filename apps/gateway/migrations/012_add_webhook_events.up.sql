-- Migration: Add webhook relay events table
-- Purpose: Store incoming webhooks with retry state for reliable delivery
-- Note: This is separate from webhook_events in migration 009 (payment provider idempotency)

-- Webhook relay events table - stores all incoming webhooks for relay with retry logic
CREATE TABLE IF NOT EXISTS webhook_relay_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Event metadata
    source VARCHAR(255) NOT NULL,          -- Source system (e.g., 'stripe', 'razorpay', 'github')
    event_type VARCHAR(255) NOT NULL,      -- Event type (e.g., 'payment.succeeded', 'subscription.updated')
    
    -- Payload
    payload JSONB NOT NULL,                -- Original webhook payload
    headers JSONB,                         -- Original HTTP headers (for signature verification)
    
    -- Delivery configuration
    target_url TEXT NOT NULL,              -- Where to forward the webhook
    
    -- Retry logic
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, processing, delivered, failed, dead_letter
    retries INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMP WITH TIME ZONE,
    
    -- Results tracking
    last_error TEXT,                       -- Last delivery error message
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    response_status_code INT,              -- HTTP status from target endpoint
    response_body TEXT,                    -- Response from target (truncated if large)
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Indexes for efficient querying
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter'))
);

-- Index for user queries (webhook status page)
CREATE INDEX idx_webhook_relay_events_user_id ON webhook_relay_events(user_id, created_at DESC);

-- Index for delivery queue processing (find pending webhooks ready to retry)
CREATE INDEX idx_webhook_relay_events_delivery_queue ON webhook_relay_events(status, next_attempt_at) 
WHERE status IN ('pending', 'failed');

-- Index for monitoring and analytics (by source and type)
CREATE INDEX idx_webhook_relay_events_source_type ON webhook_relay_events(source, event_type, created_at DESC);

-- Index for cleanup operations (find old dead letters)
CREATE INDEX idx_webhook_relay_events_dead_letter ON webhook_relay_events(status, created_at) 
WHERE status = 'dead_letter';

COMMENT ON TABLE webhook_relay_events IS 'Stores incoming webhooks with retry state for reliable delivery (webhook relay system)';
COMMENT ON COLUMN webhook_relay_events.source IS 'Originating system that sent the webhook';
COMMENT ON COLUMN webhook_relay_events.event_type IS 'Type of event (e.g., payment.succeeded)';
COMMENT ON COLUMN webhook_relay_events.payload IS 'Original JSON payload from webhook';
COMMENT ON COLUMN webhook_relay_events.retries IS 'Number of delivery attempts made';
COMMENT ON COLUMN webhook_relay_events.next_attempt_at IS 'When next retry should be attempted (exponential backoff)';
