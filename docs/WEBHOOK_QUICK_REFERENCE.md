# Webhook Relay System - Quick Reference

## Overview

RateGuard's webhook relay system provides reliable webhook delivery with automatic retries, exponential backoff, and circuit breaker protection.

## Quick Start

### 1. Accept a Webhook

```bash
POST /api/v1/webhook/inbox
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "source": "stripe",
  "event_type": "payment.succeeded",
  "payload": { ... },
  "target_url": "https://your-app.com/webhook"
}
```

**Response (202 Accepted):**

```json
{
  "id": "uuid",
  "status": "accepted",
  "message": "Webhook accepted for delivery",
  "received_at": "2024-01-15T10:30:00Z"
}
```

### 2. Check Status

```bash
GET /api/v1/webhook/status
Authorization: Bearer {api_key}
```

### 3. Get Event Details

```bash
GET /api/v1/webhook/events/{id}
Authorization: Bearer {api_key}
```

## Webhook Lifecycle

```
Accepted → Pending → Processing → [Delivered | Failed]
                          ↓
                    (Retry with backoff)
                          ↓
                    Dead Letter (after max retries)
```

## Status Values

| Status        | Description                                      |
| ------------- | ------------------------------------------------ |
| `pending`     | Waiting for first delivery attempt               |
| `processing`  | Currently being delivered                        |
| `delivered`   | Successfully delivered (2xx response)            |
| `failed`      | Failed, will retry if attempts remain            |
| `dead_letter` | Max retries exceeded, manual intervention needed |

## Retry Behavior

### Retry Schedule (Default)

- Attempt 1: Immediate
- Attempt 2: +5 seconds
- Attempt 3: +10 seconds
- Attempt 4: +20 seconds
- Attempt 5: +40 seconds
- Attempt 6: +80 seconds (capped at 5 minutes)

### HTTP Codes - Retry Decision

| Code | Action      | Reason                   |
| ---- | ----------- | ------------------------ |
| 2xx  | ✅ Success  | Delivered                |
| 4xx  | ❌ No Retry | Client error (permanent) |
| 408  | 🔄 Retry    | Request timeout          |
| 429  | 🔄 Retry    | Rate limited             |
| 5xx  | 🔄 Retry    | Server error (temporary) |

## Configuration

### Environment Variables

```bash
WEBHOOK_ENABLED=true                # Enable/disable system
WEBHOOK_WORKER_COUNT=5              # Concurrent workers
WEBHOOK_POLL_INTERVAL_SEC=5         # Check interval
WEBHOOK_DELIVERY_TIMEOUT_SEC=30     # HTTP timeout
WEBHOOK_MAX_RETRIES=5               # Max attempts
WEBHOOK_BASE_RETRY_DELAY_SEC=5      # Initial delay
WEBHOOK_MAX_RETRY_DELAY_SEC=300     # Max delay cap
WEBHOOK_RETENTION_DAYS=30           # Cleanup threshold
```

## API Endpoints

### POST /api/v1/webhook/inbox

Accept webhook for relay

- **Auth:** Required
- **Body:** WebhookInboxRequest
- **Response:** 202 Accepted

### GET /api/v1/webhook/status

List webhooks with pagination

- **Auth:** Required
- **Query Params:**
  - `page` (default: 1)
  - `page_size` (default: 20, max: 100)
  - `status` (optional: pending, processing, delivered, failed, dead_letter)
- **Response:** WebhookStatusResponse

### GET /api/v1/webhook/stats

Get delivery statistics

- **Auth:** Required
- **Response:** Aggregated metrics

### GET /api/v1/webhook/events/:id

Get event details

- **Auth:** Required
- **Response:** WebhookEvent

## Filtering Examples

```bash
# Only pending webhooks
GET /api/v1/webhook/status?status=pending

# Failed webhooks needing attention
GET /api/v1/webhook/status?status=dead_letter

# Recent webhooks (first page)
GET /api/v1/webhook/status?page=1&page_size=10

# Successful deliveries
GET /api/v1/webhook/status?status=delivered
```

## Circuit Breaker Protection

When a target endpoint repeatedly fails:

1. **Closed State:** Normal operation
2. **Open State:** Fast-fail (no delivery attempts)
3. **Half-Open State:** Test with limited requests
4. **Auto Recovery:** Closes after successful tests

**Impact:** Protects your webhook workers from wasting resources on bad endpoints.

## Monitoring

### Key Metrics

- Total webhooks (by status)
- Delivery success rate
- Average retry count
- Worker throughput
- Dead letter queue size

### Health Check

```bash
GET /ready
```

Includes webhook worker health in response.

## Best Practices

### 1. **Idempotency**

Target endpoints should handle duplicate deliveries gracefully (retries may cause duplicates).

### 2. **Fast Responses**

Target endpoints should respond quickly (<30s) to avoid timeouts.

### 3. **Status Codes**

Return appropriate HTTP status codes:

- `200 OK` - Successfully processed
- `202 Accepted` - Queued for async processing
- `4xx` - Don't send again (permanent error)
- `5xx` - Temporary error, will retry

### 4. **Monitor Dead Letters**

Check `/api/v1/webhook/status?status=dead_letter` regularly for failed webhooks needing attention.

### 5. **Signature Verification**

Original webhook headers are preserved in the relay for signature verification.

## Troubleshooting

### Webhooks Not Delivering

1. Check target URL is accessible
2. Verify endpoint returns 2xx status
3. Check circuit breaker status
4. Review worker logs for errors

### High Retry Rates

1. Check target endpoint health
2. Increase endpoint timeout
3. Review error messages in webhook events
4. Consider temporary rate limiting

### Dead Letter Queue Growing

1. Investigate common failure patterns
2. Fix endpoint issues
3. Consider manual replay (future feature)
4. Adjust retry configuration if needed

## Testing

### Run Test Suite

```bash
./test-webhook-relay.sh
```

### Manual Testing

```bash
# Test with httpbin (always succeeds)
curl -X POST http://localhost:8008/api/v1/webhook/inbox \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test",
    "event_type": "test.success",
    "payload": {"test": true},
    "target_url": "https://httpbin.org/post"
  }'

# Test retry logic (always fails with 500)
curl -X POST http://localhost:8008/api/v1/webhook/inbox \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test",
    "event_type": "test.retry",
    "payload": {"test": true},
    "target_url": "https://httpbin.org/status/500"
  }'
```

## Database Queries

### Find Stuck Webhooks

```sql
SELECT id, source, event_type, retries, status,
       AGE(NOW(), created_at) as age
FROM webhook_events
WHERE status IN ('pending', 'failed')
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at;
```

### Delivery Success Rate

```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

### Top Failing Endpoints

```sql
SELECT
  target_url,
  COUNT(*) as failures,
  AVG(retries) as avg_retries
FROM webhook_events
WHERE status = 'dead_letter'
GROUP BY target_url
ORDER BY failures DESC
LIMIT 10;
```

## Performance Tuning

### Low Volume (<100/hour)

```yaml
webhook:
  worker_count: 2
  poll_interval_sec: 10
```

### Medium Volume (100-1000/hour)

```yaml
webhook:
  worker_count: 5
  poll_interval_sec: 5
```

### High Volume (>1000/hour)

```yaml
webhook:
  worker_count: 10
  poll_interval_sec: 2
```

## Security Considerations

1. **Authentication:** All webhook endpoints require API key/JWT
2. **Ownership:** Users can only access their own webhooks
3. **Input Validation:** Source, event_type, target_url validated
4. **Header Preservation:** Original headers stored for signature verification
5. **SSL/TLS:** HTTPS recommended for target URLs

## Limits & Quotas

| Item               | Free   | Pro     | Enterprise   |
| ------------------ | ------ | ------- | ------------ |
| Max Webhooks/Month | 1,000  | 100,000 | Unlimited    |
| Max Retries        | 5      | 5       | Configurable |
| Retention          | 7 days | 30 days | 90 days      |
| Priority Delivery  | No     | No      | Yes          |

## Support

- **Documentation:** `/docs/WEBHOOK_IMPLEMENTATION_SUMMARY.md`
- **Test Script:** `./test-webhook-relay.sh`
- **Logs:** Check application logs for detailed error messages
- **Health:** `/ready` endpoint for system health

---

**Last Updated:** Implementation completed
**Version:** 1.0.0
