-- Migration 009: Add webhook_events table for idempotency tracking
-- Purpose: Track webhook events from payment providers to prevent duplicate processing

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('razorpay', 'stripe', 'manual')),
    external_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure we don't process the same event twice
    CONSTRAINT unique_provider_event UNIQUE(provider, external_id)
);

-- Index for efficient lookups when processing webhooks
CREATE INDEX idx_webhook_events_provider ON webhook_events(provider, created_at DESC);

-- Index for troubleshooting failed webhooks
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed, created_at DESC)
WHERE processed = FALSE;

-- Add comment for documentation
COMMENT ON TABLE webhook_events IS 'Tracks webhook events from payment providers for idempotency and audit trail';
COMMENT ON COLUMN webhook_events.external_id IS 'The event ID from the payment provider (e.g., evt_xxx from Razorpay)';
COMMENT ON COLUMN webhook_events.payload IS 'Full webhook payload as JSON for debugging and audit';
