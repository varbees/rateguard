import { Metadata } from "next";
import {
  Send,
  RefreshCw,
  Database,
  Activity,
  AlertCircle,
  CheckCircle,
  Code,
  BarChart3,
} from "lucide-react";
import { DocsSectionHeader } from "@/components/docs/section-header";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { DocsPager } from "@/components/docs/pager";
import { Callout } from "@/components/docs/Callout";
import { PlanBadge } from "@/components/docs/PlanBadge";

export const metadata: Metadata = {
  title: "Webhook Relay & Retries | RateGuard Documentation",
  description:
    "Reliable webhook delivery with automatic retries, dead letter queues, and full observability.",
};

export default function WebhooksPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Webhook Relay & Retries
            </h1>
            <p className="text-xl text-muted-foreground mt-2">
              Reliable event delivery with automatic retries, dead letter
              queues, and full delivery history. Never miss a webhook.
            </p>
          </div>
          <PlanBadge plans={["pro", "business"]} />
        </div>
      </div>

      <Callout title="Enterprise-Grade Reliability" type="default">
        Our webhook system uses PostgreSQL for persistence and exponential
        backoff for retries. Available in Pro and Business plans.
      </Callout>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<Activity className="h-5 w-5" />}
          title="How It Works"
          description="RateGuard ensures webhook delivery through a multi-stage process."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ol>
            <li>
              <strong>Ingestion</strong> - Send webhook to{" "}
              <code>POST /api/v1/webhook/inbox</code>
            </li>
            <li>
              <strong>Persistence</strong> - Payload saved to PostgreSQL, return{" "}
              <code>202 Accepted</code>
            </li>
            <li>
              <strong>Background Delivery</strong> - Worker picks up event and
              attempts delivery
            </li>
            <li>
              <strong>Retry Logic</strong> - Exponential backoff (5s, 10s,
              20s...) up to 5 minutes
            </li>
            <li>
              <strong>Dead Letter Queue</strong> - Failed events preserved for
              manual inspection
            </li>
          </ol>
        </div>

        <DocsSectionHeader
          icon={<Database className="h-5 w-5" />}
          title="Key Features"
          description="Built for production reliability."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Persistent Queue</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              All webhooks immediately stored in PostgreSQL. Survives restarts
              and crashes.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Exponential Backoff</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatic retries with increasing delays to prevent overwhelming
              your servers.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Dead Letter Queue</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Failed events preserved for manual retry and debugging.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Full Observability</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Track delivery status, response codes, and timing for every
              attempt.
            </p>
          </div>
        </div>

        <DocsSectionHeader
          icon={<Code className="h-5 w-5" />}
          title="API Reference"
          description="Send and manage webhooks programmatically."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Send a Webhook</h3>
            <CodeTabs
              examples={[
                {
                  label: "cURL",
                  language: "bash",
                  code: `curl -X POST https://api.rateguard.io/api/v1/webhook/inbox \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source": "stripe",
    "event_type": "payment_intent.succeeded",
    "payload": { 
      "id": "pi_123", 
      "amount": 2000 
    },
    "target_url": "https://your-api.com/webhooks"
  }'`,
                },
                {
                  label: "JavaScript",
                  language: "javascript",
                  code: `const response = await fetch('https://api.rateguard.io/api/v1/webhook/inbox', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    source: 'stripe',
    event_type: 'payment_intent.succeeded',
    payload: { id: 'pi_123', amount: 2000 },
    target_url: 'https://your-api.com/webhooks'
  })
});

const data = await response.json();
console.log('Webhook queued:', data.event_id);`,
                },
                {
                  label: "Python",
                  language: "python",
                  code: `import requests

response = requests.post(
    'https://api.rateguard.io/api/v1/webhook/inbox',
    headers={'Authorization': 'Bearer YOUR_TOKEN'},
    json={
        'source': 'stripe',
        'event_type': 'payment_intent.succeeded',
        'payload': {'id': 'pi_123', 'amount': 2000},
        'target_url': 'https://your-api.com/webhooks'
    }
)

print(f"Webhook queued: {response.json()['event_id']}")`,
                },
              ]}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Check Status</h3>
            <CodeBlock
              language="bash"
              value={`# Get all webhooks by status
curl https://api.rateguard.io/api/v1/webhook/status?status=failed \\
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific webhook
curl https://api.rateguard.io/api/v1/webhook/events/:id \\
  -H "Authorization: Bearer YOUR_TOKEN"`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Manual Retry</h3>
            <CodeBlock
              language="bash"
              value={`# Retry a failed webhook
curl -X POST https://api.rateguard.io/api/v1/webhook/events/:id/retry \\
  -H "Authorization: Bearer YOUR_TOKEN"`}
            />
          </div>
        </div>

        <DocsSectionHeader
          icon={<BarChart3 className="h-5 w-5" />}
          title="Dashboard Features"
          description="Manage webhooks through the web interface."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ul>
            <li>
              <strong>Event Log</strong> - See all events in real-time with
              filtering
            </li>
            <li>
              <strong>Manual Retry</strong> - One-click retry for failed events
            </li>
            <li>
              <strong>Payload Inspector</strong> - View full JSON payloads and
              headers
            </li>
            <li>
              <strong>Delivery Stats</strong> - Success rate, average latency,
              retry counts
            </li>
            <li>
              <strong>Test Generator</strong> - Send test webhooks with
              templates
            </li>
          </ul>
        </div>

        <Callout title="Configuration" type="warning">
          <div className="space-y-2 mt-2">
            <p>
              <strong>Max Retries:</strong> 5 attempts (configurable via{" "}
              <code>WEBHOOK_MAX_RETRIES</code>)
            </p>
            <p>
              <strong>Retry Delays:</strong> 5s, 10s, 20s, 40s, 80s (exponential
              backoff)
            </p>
            <p>
              <strong>Worker Count:</strong> Default 10 workers (configurable
              via <code>WEBHOOK_WORKER_COUNT</code>)
            </p>
          </div>
        </Callout>

        <DocsPager
          prev={{
            href: "/docs/features/automatic-retry",
            title: "Automatic Retry",
          }}
          next={{
            href: "/docs/features/concurrency",
            title: "Dual Concurrency",
          }}
        />
      </div>
    </div>
  );
}
