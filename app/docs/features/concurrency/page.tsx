import { Metadata } from "next";
import {
  Zap,
  Cpu,
  Layers,
  BarChart3,
  Settings,
  Activity,
  TrendingUp,
} from "lucide-react";
import { DocsSectionHeader } from "@/components/docs/section-header";
import { CodeBlock } from "@/components/docs/code-block";
import { DocsPager } from "@/components/docs/pager";
import { Callout } from "@/components/docs/Callout";
import { PlanBadge } from "@/components/docs/PlanBadge";

export const metadata: Metadata = {
  title: "Dual Concurrency Architecture | RateGuard Documentation",
  description:
    "Learn how RateGuard uses unbounded proxying and bounded aggregation for optimal performance.",
};

export default function ConcurrencyPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Dual Concurrency Architecture
            </h1>
            <p className="text-xl text-muted-foreground mt-2">
              Intelligent concurrency model that balances high throughput with
              resource protection using both unbounded and bounded strategies.
            </p>
          </div>
          <PlanBadge plans={["free", "pro", "business"]} />
        </div>
      </div>

      <Callout title="Production Architecture" type="default">
        RateGuard uses a sophisticated dual concurrency model: unbounded
        goroutines for proxying (50k+ req/s) and bounded worker pools for heavy
        aggregation (resource-safe).
      </Callout>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<Layers className="h-5 w-5" />}
          title="The Two Paths"
          description="Different concurrency strategies for different workloads."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border-2 border-primary/30 rounded-lg p-6 bg-primary/5">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-8 h-8 text-primary" />
              <div>
                <h3 className="text-xl font-bold">Unbounded Proxying</h3>
                <p className="text-sm text-muted-foreground">
                  High Throughput Path
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <strong className="text-foreground">Mechanism:</strong>
                <p className="text-muted-foreground">
                  Spawns one lightweight Goroutine per request
                </p>
              </div>
              <div>
                <strong className="text-foreground">Capacity:</strong>
                <p className="text-muted-foreground">
                  50,000+ requests per second per instance
                </p>
              </div>
              <div>
                <strong className="text-foreground">Use Case:</strong>
                <p className="text-muted-foreground">
                  Simple forwarding, rate limit checks, auth verification
                </p>
              </div>
              <div>
                <strong className="text-foreground">Bottleneck:</strong>
                <p className="text-muted-foreground">
                  Limited only by CPU, Memory, and Network I/O
                </p>
              </div>
            </div>
          </div>

          <div className="border-2 border-blue-500/30 rounded-lg p-6 bg-blue-500/5">
            <div className="flex items-center gap-3 mb-4">
              <Cpu className="w-8 h-8 text-blue-500" />
              <div>
                <h3 className="text-xl font-bold">Bounded Aggregation</h3>
                <p className="text-sm text-muted-foreground">
                  Resource Protection Path
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <strong className="text-foreground">Mechanism:</strong>
                <p className="text-muted-foreground">
                  Requests queued and processed by fixed-size worker pool
                </p>
              </div>
              <div>
                <strong className="text-foreground">Capacity:</strong>
                <p className="text-muted-foreground">
                  Controlled throughput (~250 req/s depending on latency)
                </p>
              </div>
              <div>
                <strong className="text-foreground">Use Case:</strong>
                <p className="text-muted-foreground">
                  Aggregation, heavy transformation, fan-out requests
                </p>
              </div>
              <div>
                <strong className="text-foreground">Protection:</strong>
                <p className="text-muted-foreground">
                  Prevents goroutine leaks and memory exhaustion
                </p>
              </div>
            </div>
          </div>
        </div>

        <DocsSectionHeader
          icon={<BarChart3 className="h-5 w-5" />}
          title="Comparison Table"
          description="Understanding the trade-offs between unbounded and bounded approaches."
        />

        <div className="overflow-x-auto">
          <table className="w-full border rounded-lg">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-4 font-semibold">Feature</th>
                <th className="text-center p-4 font-semibold">
                  Unbounded Proxy
                </th>
                <th className="text-center p-4 font-semibold">
                  Bounded Aggregator
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-4 font-medium">Primary Goal</td>
                <td className="p-4 text-center text-muted-foreground">
                  Max Speed
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Max Stability
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium">Concurrency</td>
                <td className="p-4 text-center text-muted-foreground">
                  Unlimited
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Fixed (Configurable)
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium">Queueing</td>
                <td className="p-4 text-center text-muted-foreground">
                  None (Direct)
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  FIFO / Priority Queue
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium">Risk</td>
                <td className="p-4 text-center text-destructive">
                  Resource Exhaustion
                </td>
                <td className="p-4 text-center text-yellow-600">
                  Increased Latency (if full)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <DocsSectionHeader
          icon={<Settings className="h-5 w-5" />}
          title="Configuration"
          description="Tune concurrency settings for your workload."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Worker Pool Configuration</h3>
            <p className="text-muted-foreground">
              For the bounded aggregation path, you can configure the worker
              pool size:
            </p>
            <CodeBlock
              language="bash"
              value={`# Environment Variables
AGG_WORKER_POOL_WORKER_COUNT=50  # Number of concurrent workers
AGG_WORKER_POOL_QUEUE_SIZE=1000  # Max queue size before rejecting

# Example: High-throughput setup
AGG_WORKER_POOL_WORKER_COUNT=100
AGG_WORKER_POOL_QUEUE_SIZE=5000

# Example: Resource-constrained setup
AGG_WORKER_POOL_WORKER_COUNT=20
AGG_WORKER_POOL_QUEUE_SIZE=500`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Monitoring</h3>
            <p className="text-muted-foreground">
              Track concurrency metrics in your dashboard:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <strong>Active Goroutines:</strong> Real-time count of proxy
                goroutines
              </li>
              <li>
                <strong>Worker Pool Utilization:</strong> Percentage of workers
                busy
              </li>
              <li>
                <strong>Queue Depth:</strong> Number of requests waiting for
                workers
              </li>
              <li>
                <strong>Throughput:</strong> Requests per second for each path
              </li>
            </ul>
          </div>
        </div>

        <DocsSectionHeader
          icon={<Activity className="h-5 w-5" />}
          title="Why This Matters"
          description="The benefits of a dual concurrency approach."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            By separating concerns, RateGuard ensures that slow aggregation
            endpoints never block your critical high-speed API traffic. This
            architecture provides:
          </p>
          <ul>
            <li>
              <strong>Predictable Performance:</strong> Know exactly how the
              system will behave under load
            </li>
            <li>
              <strong>Resource Safety:</strong> Worker pools prevent runaway
              resource consumption
            </li>
            <li>
              <strong>Optimal Throughput:</strong> Unbounded path handles 99%
              of traffic at maximum speed
            </li>
            <li>
              <strong>Graceful Degradation:</strong> System remains stable even
              when queues fill
            </li>
          </ul>
        </div>

        <Callout title="Best Practices" type="warning">
          <ul className="list-disc pl-4 space-y-1 mt-2">
            <li>
              <strong>Monitor queue depth:</strong> If consistently high,
              increase worker count
            </li>
            <li>
              <strong>Use unbounded for simple proxying:</strong> Reserve
              bounded path for heavy operations
            </li>
            <li>
              <strong>Set realistic queue sizes:</strong> Balance memory usage
              vs request acceptance
            </li>
            <li>
              <strong>Profile your workload:</strong> Adjust worker count based
              on actual latency
            </li>
          </ul>
        </Callout>

        <DocsPager
          prev={{
            href: "/docs/features/webhooks",
            title: "Webhook Relay",
          }}
          next={{
            href: "/docs/features/circuit-breaker",
            title: "Circuit Breaker",
          }}
        />
      </div>
    </div>
  );
}
