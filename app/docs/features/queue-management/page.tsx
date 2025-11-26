import { Metadata } from "next";
import {
  Clock,
  Activity,
  Settings,
  AlertTriangle,
  BarChart,
  CheckCircle,
  Code,
  List,
} from "lucide-react";
import { DocsSectionHeader } from "@/components/docs/section-header";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { DocsPager } from "@/components/docs/pager";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Queue Management | RateGuard Documentation",
  description:
    "Learn how RateGuard intelligently queues requests instead of rejecting them when rate limits are hit.",
};

export default function QueueManagementPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Queue Management</h1>
        <p className="text-xl text-muted-foreground">
          Automatically queue requests instead of rejecting them when rate limits
          are hit, providing a smooth user experience without 429 errors.
        </p>
      </div>

      <Callout title="Intelligent Waiting" type="default">
        Requests wait in queue instead of failing, automatically processing when
        rate limit slots become available.
      </Callout>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<Clock className="h-5 w-5" />}
          title="How It Works"
          description="When a rate limit is reached, RateGuard automatically handles the overflow."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ol>
            <li>
              <strong>Detects rate limit</strong> - Checks if request can proceed
            </li>
            <li>
              <strong>Queues the request</strong> - Holds request in memory
            </li>
            <li>
              <strong>Waits intelligently</strong> - Polls for available slots
              (50ms intervals)
            </li>
            <li>
              <strong>Processes when ready</strong> - Executes as soon as limit
              allows
            </li>
            <li>
              <strong>Returns response</strong> - Includes queue timing metadata
            </li>
          </ol>
        </div>

        <DocsSectionHeader
          icon={<List className="h-5 w-5" />}
          title="Key Features"
          description="Powerful queuing capabilities out of the box."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Automatic Queuing</h3>
            <p className="text-muted-foreground">
              No configuration needed - requests automatically queue when limits
              are hit:
            </p>
            <CodeBlock
              language="javascript"
              value={`// Your API call (no changes needed)
const response = await fetch('https://rateguard.com/proxy/stripe/customers', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});

// If rate limited, request waits in queue automatically
// Response includes queue metadata when processed`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Queue Metadata</h3>
            <p className="text-muted-foreground">
              Responses include queue information when requests were queued:
            </p>
            <CodeBlock
              language="json"
              value={`{
  "request_id": "123e4567-e89b-12d3-a456-426614174000",
  "status_code": 200,
  "queued": true,
  "queue_duration": "1.234s",
  "total_duration": "1.456s",
  "body": {...}
}`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configurable Timeout</h3>
            <p className="text-muted-foreground">
              Maximum queue wait time is configurable (default: 30 seconds). If
              exceeded, request fails with service unavailable:
            </p>
            <CodeBlock
              language="json"
              value={`{
  "error": {
    "code": "QUEUE_TIMEOUT",
    "message": "Request queued too long, please try again",
    "details": "Waited 30s, max 30s"
  },
  "status_code": 503
}`}
            />
          </div>
        </div>

        <DocsSectionHeader
          icon={<BarChart className="h-5 w-5" />}
          title="Queue Analytics"
          description="Monitor queue performance in real-time through the dashboard."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ul>
            <li>
              <strong>Active Queues:</strong> See currently queued requests per
              API
            </li>
            <li>
              <strong>Queue Time:</strong> Average wait time before processing
            </li>
            <li>
              <strong>Timeout Rate:</strong> Percentage of requests that
              exceeded queue timeout
            </li>
            <li>
              <strong>Queue Depth:</strong> Maximum queue size reached
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Viewing Queue Stats</h3>
          <p className="text-muted-foreground">
            Access queue analytics in your dashboard:
          </p>
          <CodeBlock
            language="bash"
            value={`GET /api/v1/dashboard/queues

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
}`}
          />
        </div>

        <DocsSectionHeader
          icon={<Settings className="h-5 w-5" />}
          title="Queue Configuration"
          description="Customize queue behavior per API."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Maximum Wait Time</h3>
            <CodeBlock
              language="json"
              value={`PUT /api/v1/dashboard/queues/config

{
  "api_id": "123e4567-e89b-12d3-a456-426614174000",
  "max_wait_seconds": 30,
  "check_interval_ms": 50
}`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Queue Limits</h3>
            <CodeBlock
              language="json"
              value={`{
  "max_queue_size": 1000,
  "queue_timeout_seconds": 30,
  "enable_priority": false
}`}
            />
          </div>
        </div>

        <DocsSectionHeader
          icon={<Code className="h-5 w-5" />}
          title="Integration Examples"
          description="Handling queued responses in your code."
        />

        <CodeTabs
          examples={[
            {
              label: "JavaScript",
              language: "javascript",
              code: `async function makeRequest(endpoint) {
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
}`,
            },
            {
              label: "Python",
              language: "python",
              code: `import requests

def make_request(endpoint):
    response = requests.get(
        f'https://rateguard.com/proxy/my-api/{endpoint}',
        headers={'Authorization': 'Bearer YOUR_TOKEN'}
    )
    
    data = response.json()
    
    # Check if request was queued
    if data.get('queued'):
        print(f"Request queued for {data['queue_duration']}")
    
    return data`,
            },
            {
              label: "cURL",
              language: "bash",
              code: `curl -X GET https://rateguard.com/proxy/my-api/endpoint \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -v

# Response will include queue metadata if queued:
# "queued": true, "queue_duration": "1.234s"`,
            },
          ]}
        />

        <Callout title="Best Practices" type="warning">
          <ul className="list-disc pl-4 space-y-1 mt-2">
            <li>
              <strong>Set realistic timeouts:</strong> Balance between user
              experience and system load.
            </li>
            <li>
              <strong>Monitor queue depth:</strong> High queue depth indicates
              rate limits may be too restrictive.
            </li>
            <li>
              <strong>Check timeout rates:</strong> If &gt;5%, consider
              increasing rate limits.
            </li>
            <li>
              <strong>Use queue metadata:</strong> Log queue times to identify
              bottlenecks.
            </li>
          </ul>
        </Callout>

        <DocsSectionHeader
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Troubleshooting"
          description="Common issues and how to resolve them."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">High Queue Depths</h3>
            <p className="text-muted-foreground">
              If you see consistently high queue depths:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              <li>Check if rate limits are too restrictive</li>
              <li>Use Rate Limit Discovery to find optimal limits</li>
              <li>Consider spreading load across more time</li>
              <li>Implement retry logic with exponential backoff</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Frequent Timeouts</h3>
            <p className="text-muted-foreground">
              If requests frequently timeout:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              <li>Increase max_wait_seconds (if acceptable)</li>
              <li>Reduce traffic volume or spread it out</li>
              <li>Check if upstream API is slow</li>
              <li>Consider implementing request prioritization</li>
            </ul>
          </div>
        </div>

        <DocsSectionHeader
          icon={<Activity className="h-5 w-5" />}
          title="Performance Considerations"
          description="Impact of queuing on system resources."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" /> Memory Usage
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Each queued request consumes minimal memory (~1KB)</li>
              <li>Default max queue size: 1000 requests per API</li>
              <li>Requests automatically cleaned up after processing</li>
            </ul>
          </div>
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" /> Latency Impact
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Queue check interval: 50ms (configurable)</li>
              <li>Minimal overhead when queue is empty</li>
              <li>Queue time included in response metadata</li>
            </ul>
          </div>
        </div>

        <DocsPager
          prev={{
            href: "/docs/features/transparent-proxy",
            title: "Transparent Proxy",
          }}
          next={{
            href: "/docs/features/rate-limit-discovery",
            title: "Rate Limit Discovery",
          }}
        />
      </div>
    </div>
  );
}
