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
import { PlanBadge } from "@/components/docs/PlanBadge";

export const metadata: Metadata = {
  title: "Queue Management | RateGuard Documentation",
  description:
    "Learn how RateGuard intelligently queues requests instead of rejecting them when rate limits are hit.",
};

export default function QueueManagementPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Priority Queue Management
            </h1>
            <p className="text-xl text-muted-foreground">
              Intelligent, Redis-backed priority queuing ensures critical traffic
              always gets through, even during massive spikes.
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <PlanBadge plans={["free", "pro", "business"]} />
            <span className="text-xs text-muted-foreground">Priority: Pro/Business only</span>
          </div>
        </div>
      </div>

      <Callout title="Redis-Backed Persistence" type="default">
        Our queue isn&apos;t just in-memory. It&apos;s backed by Redis Sorted
        Sets, meaning your queued requests survive application restarts and are
        processed in strict priority order. <strong>Priority queuing available in Pro and Business plans.</strong>
      </Callout>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<Clock className="h-5 w-5" />}
          title="How It Works"
          description="When rate limits are hit, requests enter a sophisticated priority queue."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ol>
            <li>
              <strong>Priority Assignment</strong> - Each request is assigned a
              priority (1-10)
            </li>
            <li>
              <strong>Redis Enqueue</strong> - Request is stored in a Redis
              Sorted Set (ZADD)
            </li>
            <li>
              <strong>Score Calculation</strong> - Score = Priority + Timestamp
              (FIFO within priority)
            </li>
            <li>
              <strong>Intelligent Polling</strong> - Workers poll for highest
              priority items first
            </li>
            <li>
              <strong>Execution</strong> - Request is dequeued and executed when
              slots open
            </li>
          </ol>
        </div>

        <DocsSectionHeader
          icon={<List className="h-5 w-5" />}
          title="Key Features"
          description="Enterprise-grade queuing capabilities."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Priority Levels</h3>
            <p className="text-muted-foreground">
              Assign priority levels from 1 (lowest) to 10 (highest). High
              priority requests literally jump the line.
            </p>
            <Callout title="Plan Availability" type="warning">
              <ul className="list-disc pl-4 space-y-1 mt-2">
                <li><strong>Free Plan:</strong> Standard FIFO queuing (no priority)</li>
                <li><strong>Pro Plan:</strong> Priority levels 1-10 with Redis persistence</li>
                <li><strong>Business Plan:</strong> Priority levels 1-10 with Redis persistence</li>
              </ul>
            </Callout>
            <CodeBlock
              language="json"
              value={`// Request with high priority (Pro/Business only)
{
  "target_api": "stripe",
  "priority": 10, // VIP treatment
  "body": { ... }
}`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Redis Persistence</h3>
            <p className="text-muted-foreground">
              Queues are durable. If a worker crashes, the request remains in
              Redis and will be picked up by another instance.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Queue Metadata</h3>
            <p className="text-muted-foreground">
              Responses include detailed queue timing information:
            </p>
            <CodeBlock
              language="json"
              value={`{
  "request_id": "123e4567-e89b-12d3-a456-426614174000",
  "queued": true,
  "queue_duration": "1.234s",
  "priority": 10,
  "position_in_queue": 1
}`}
            />
          </div>
        </div>

        <DocsSectionHeader
          icon={<BarChart className="h-5 w-5" />}
          title="Queue Analytics"
          description="Monitor queue performance in real-time."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ul>
            <li>
              <strong>Active Queues:</strong> Real-time count of queued items
            </li>
            <li>
              <strong>Wait Times:</strong> Average wait time by priority level
            </li>
            <li>
              <strong>Throughput:</strong> Dequeue rate per second
            </li>
            <li>
              <strong>Drop Rate:</strong> Requests that timed out (TTL expired)
            </li>
          </ul>
        </div>

        <DocsSectionHeader
          icon={<Settings className="h-5 w-5" />}
          title="Configuration"
          description="Fine-tune your queue settings."
        />

        <div className="space-y-4">
          <CodeBlock
            language="json"
            value={`{
  "max_queue_size": 5000,
  "default_priority": 5,
  "queue_ttl_seconds": 60,
  "redis_key_prefix": "queue:"
}`}
          />
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
