-- Migration: Add streaming support columns to api_metrics table
-- Created: 2025-11-23
-- Purpose: Track streaming-specific metrics for billing and analytics

-- Add streaming-related columns to api_metrics table
ALTER TABLE api_metrics
ADD COLUMN IF NOT EXISTS is_streaming BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bytes_streamed BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS stream_duration_ms BIGINT DEFAULT 0;

-- Create index for streaming queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_metrics_streaming ON api_metrics(user_id, is_streaming, timestamp DESC);

-- Create index for bytes queries (billing optimization)
CREATE INDEX IF NOT EXISTS idx_metrics_bytes ON api_metrics(user_id, bytes_streamed) WHERE is_streaming = true;

-- Add comments for documentation
COMMENT ON COLUMN api_metrics.is_streaming IS 'Whether this request used streaming (SSE, NDJSON, chunked)';
COMMENT ON COLUMN api_metrics.bytes_streamed IS 'Total bytes transferred during stream (for billing)';
COMMENT ON COLUMN api_metrics.stream_duration_ms IS 'Duration of stream in milliseconds';

-- Optional: Add bytes_transferred to api_usage for monthly billing totals
ALTER TABLE api_usage
ADD COLUMN IF NOT EXISTS bytes_transferred BIGINT DEFAULT 0;

COMMENT ON COLUMN api_usage.bytes_transferred IS 'Total bytes transferred for billing period';

-- Example query: Get streaming usage for current month
-- SELECT 
--   user_id,
--   target_api,
--   COUNT(*) as stream_count,
--   SUM(bytes_streamed) as total_bytes,
--   AVG(stream_duration_ms) as avg_duration
-- FROM api_metrics
-- WHERE is_streaming = true
--   AND timestamp >= date_trunc('month', CURRENT_DATE)
-- GROUP BY user_id, target_api;
