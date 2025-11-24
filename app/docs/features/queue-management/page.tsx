import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Queue Management | RateGuard Documentation",
  description:
    "Learn how RateGuard intelligently queues requests instead of rejecting them when rate limits are hit.",
};

export default function QueueManagementPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground">
      <h1>Queue Management 🎯</h1>
      <p className="lead">
        RateGuard automatically queues requests instead of rejecting them when
        rate limits are hit, providing a smooth user experience without 429
        errors.
      </p>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 my-6">
        <p className="text-sm m-0">
          <strong>✨ Intelligent Waiting:</strong> Requests wait in queue
          instead of failing, automatically processing when rate limit slots
          become available.
        </p>
      </div>

      <h2>How It Works</h2>
      <p>
        When a rate limit is reached, instead of returning a 429 error,
        RateGuard automatically:
      </p>

      <ol>
        <li>
          <strong>Detects rate limit</strong> - Checks if request can proceed
        </li>
        <li>
          <strong>Queues the request</strong> - Holds request in memory
        </li>
        <li>
          <strong>Waits intelligently</strong> - Polls for available slots (50ms
          intervals)
        </li>
        <li>
          <strong>Processes when ready</strong> - Executes as soon as limit
          allows
        </li>
        <li>
          <strong>Returns response</strong> - Includes queue timing metadata
        </li>
      </ol>

      <h2>Key Features</h2>

      <h3>Automatic Queuing</h3>
      <p>
        No configuration needed - requests automatically queue when limits are
        hit:
      </p>
      <pre>
        <code>{`// Your API call (no changes needed)
const response = await fetch('https://rateguard.com/proxy/stripe/customers', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});

// If rate limited, request waits in queue automatically
// Response includes queue metadata when processed`}</code>
      </pre>

      <h3>Queue Metadata</h3>
      <p>Responses include queue information when requests were queued:</p>
      <pre>
        <code>{`{
  "request_id": "123e4567-e89b-12d3-a456-426614174000",
  "status_code": 200,
  "queued": true,
  "queue_duration": "1.234s",
  "total_duration": "1.456s",
  "body": {...}
}`}</code>
      </pre>

      <h3>Configurable Timeout</h3>
      <p>
        Maximum queue wait time is configurable (default: 30 seconds). If
        exceeded, request fails with service unavailable:
      </p>
      <pre>
        <code>{`{
  "error": {
    "code": "QUEUE_TIMEOUT",
    "message": "Request queued too long, please try again",
    "details": "Waited 30s, max 30s"
  },
  "status_code": 503
}`}</code>
      </pre>

      <h2>Queue Analytics</h2>
      <p>Monitor queue performance in real-time through the dashboard:</p>

      <ul>
        <li>
          <strong>Active Queues:</strong> See currently queued requests per API
        </li>
        <li>
          <strong>Queue Time:</strong> Average wait time before processing
        </li>
        <li>
          <strong>Timeout Rate:</strong> Percentage of requests that exceeded
          queue timeout
        </li>
        <li>
          <strong>Queue Depth:</strong> Maximum queue size reached
        </li>
      </ul>

      <h3>Viewing Queue Stats</h3>
      <p>Access queue analytics in your dashboard:</p>
      <pre>
        <code>{`GET /api/v1/dashboard/queues

Response:
{
  "active_queues": {
    "stripe_prod": 5,
    "openai_api": 2
  },
  "stats": {
    "total_queued": 1234,
    "avg_queue_time": "0.456s",
    "timeout_rate": 0.02
  }
}`}</code>
      </pre>

      <h2>Queue Configuration</h2>
      <p>Customize queue behavior per API:</p>

      <h3>Maximum Wait Time</h3>
      <pre>
        <code>{`PUT /api/v1/dashboard/queues/config

{
  "api_id": "123e4567-e89b-12d3-a456-426614174000",
  "max_wait_seconds": 30,
  "check_interval_ms": 50
}`}</code>
      </pre>

      <h3>Queue Limits</h3>
      <pre>
        <code>{`{
  "max_queue_size": 1000,
  "queue_timeout_seconds": 30,
  "enable_priority": false
}`}</code>
      </pre>

      <h2>Best Practices</h2>

      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4 my-6">
        <h4 className="mt-0">💡 Tips for Optimal Queue Management</h4>
        <ul className="mb-0">
          <li>
            <strong>Set realistic timeouts:</strong> Balance between user
            experience and system load
          </li>
          <li>
            <strong>Monitor queue depth:</strong> High queue depth indicates
            rate limits may be too restrictive
          </li>
          <li>
            <strong>Check timeout rates:</strong> If &gt;5%, consider increasing
            rate limits
          </li>
          <li>
            <strong>Use queue metadata:</strong> Log queue times to identify
            bottlenecks
          </li>
          <li>
            <strong>Combine with discovery:</strong> Use Rate Limit Discovery to
            optimize limits
          </li>
        </ul>
      </div>

      <h2>Integration Examples</h2>

      <h3>JavaScript/TypeScript</h3>
      <pre>
        <code>{`async function makeRequest(endpoint: string) {
  const response = await fetch(\`https://rateguard.com/proxy/my-api/\${endpoint}\`, {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();
  
  // Check if request was queued
  if (data.queued) {
    console.log(\`Request queued for \${data.queue_duration}\`);
  }
  
  return data;
}`}</code>
      </pre>

      <h3>Python</h3>
      <pre>
        <code>{`import requests

def make_request(endpoint):
    response = requests.get(
        f'https://rateguard.com/proxy/my-api/{endpoint}',
        headers={'Authorization': 'Bearer YOUR_TOKEN'}
    )
    
    data = response.json()
    
    # Check if request was queued
    if data.get('queued'):
        print(f"Request queued for {data['queue_duration']}")
    
    return data`}</code>
      </pre>

      <h3>cURL</h3>
      <pre>
        <code>{`curl -X GET https://rateguard.com/proxy/my-api/endpoint \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -v

# Response will include queue metadata if queued:
# "queued": true, "queue_duration": "1.234s"`}</code>
      </pre>

      <h2>Monitoring & Alerts</h2>

      <h3>Dashboard View</h3>
      <p>
        Visit <Link href="/dashboard/queues">Dashboard → Queues</Link> to see:
      </p>
      <ul>
        <li>Real-time queue depths per API</li>
        <li>Average queue wait times</li>
        <li>Timeout rates and trends</li>
        <li>Historical queue analytics</li>
      </ul>

      <h3>API Endpoint</h3>
      <pre>
        <code>{`GET /api/v1/dashboard/queues/active

Response:
{
  "queues": [
    {
      "api_name": "stripe_prod",
      "queue_depth": 5,
      "avg_wait_time": "0.456s",
      "oldest_request": "2s ago"
    }
  ],
  "total_active": 7
}`}</code>
      </pre>

      <h2>Troubleshooting</h2>

      <h3>High Queue Depths</h3>
      <p>If you see consistently high queue depths:</p>
      <ul>
        <li>Check if rate limits are too restrictive</li>
        <li>Use Rate Limit Discovery to find optimal limits</li>
        <li>Consider spreading load across more time</li>
        <li>Implement retry logic with exponential backoff</li>
      </ul>

      <h3>Frequent Timeouts</h3>
      <p>If requests frequently timeout:</p>
      <ul>
        <li>Increase max_wait_seconds (if acceptable)</li>
        <li>Reduce traffic volume or spread it out</li>
        <li>Check if upstream API is slow</li>
        <li>Consider implementing request prioritization</li>
      </ul>

      <h3>Unexpected Queue Behavior</h3>
      <p>Debug queue issues:</p>
      <pre>
        <code>{`# Check queue configuration
GET /api/v1/dashboard/queues/config

# View active queues
GET /api/v1/dashboard/queues/active

# Cancel specific request (if needed)
DELETE /api/v1/dashboard/queues/:request_id`}</code>
      </pre>

      <h2>Performance Considerations</h2>

      <h3>Memory Usage</h3>
      <ul>
        <li>Each queued request consumes minimal memory (~1KB)</li>
        <li>Default max queue size: 1000 requests per API</li>
        <li>Requests automatically cleaned up after processing or timeout</li>
      </ul>

      <h3>Latency Impact</h3>
      <ul>
        <li>Queue check interval: 50ms (configurable)</li>
        <li>Minimal overhead when queue is empty</li>
        <li>Additional latency only when rate limited</li>
        <li>Queue time included in response metadata</li>
      </ul>

      <h2>Related Documentation</h2>
      <ul>
        <li>
          <Link href="/docs/guides/rate-limiting">Rate Limiting Guide</Link>
        </li>
        <li>
          <Link href="/docs/features/rate-limit-discovery">
            Rate Limit Discovery
          </Link>
        </li>
        <li>
          <Link href="/docs/api-reference">API Reference</Link>
        </li>
        <li>
          <Link href="/dashboard/queues">Queue Analytics Dashboard</Link>
        </li>
      </ul>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 my-6">
        <p className="text-sm m-0">
          <strong>🚀 Next Steps:</strong> Enable queue management for your APIs
          and monitor performance in the{" "}
          <Link href="/dashboard/queues">Queue Analytics Dashboard</Link>!
        </p>
      </div>
    </div>
  );
}
