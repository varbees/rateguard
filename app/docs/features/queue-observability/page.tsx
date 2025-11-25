import { Metadata } from "next";
import {
  Activity,
  BarChart2,
  Clock,
  Layers,
  AlertTriangle,
  PlayCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { queueObservabilityExamples } from "@/lib/docs/code-examples";

export const metadata: Metadata = {
  title: "Queue Observability | RateGuard Documentation",
  description:
    "Monitor and manage your API request queues with real-time observability.",
};

export default function QueueObservabilityPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12">
        <div className="container max-w-5xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Activity className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Queue Observability
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Gain deep insights into your API traffic with real-time queue
                metrics. Monitor queue depth, processing latency, and worker
                utilization to optimize performance.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Real-time Metrics
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Worker Stats
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Latency Tracking
            </Badge>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-12 space-y-12">
        {/* Key Metrics */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Key Metrics</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <Layers className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">Queue Depth</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  The number of requests currently waiting to be processed. High
                  depth indicates congestion.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Clock className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">Processing Latency</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  The time taken to process a request from entry to exit. Includes
                  queue wait time.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <BarChart2 className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">Worker Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Percentage of active workers vs total available workers. Helps in
                  scaling decisions.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Dashboard View */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Real-time Dashboard</h2>
          <p className="text-muted-foreground mb-6">
            The Queue Observability dashboard provides a live view of your system's
            health.
          </p>

          <Card className="overflow-hidden border-2">
            <div className="bg-muted/50 p-6 border-b">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-medium">System Status: Healthy</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Last updated: Just now
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-background p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Queue Depth</div>
                  <div className="text-2xl font-bold">12</div>
                </div>
                <div className="bg-background p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Avg Latency</div>
                  <div className="text-2xl font-bold">45ms</div>
                </div>
                <div className="bg-background p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Active Workers</div>
                  <div className="text-2xl font-bold">8/10</div>
                </div>
              </div>
            </div>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">
                * This is a representation of the metrics available in your dashboard.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Alerts */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Alerting Rules</h2>
          <p className="text-muted-foreground mb-6">
            Configure alerts to get notified when metrics breach critical thresholds.
          </p>

          <div className="space-y-4">
            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader className="py-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-base">High Latency Warning</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-sm text-muted-foreground">
                  Triggered when average processing latency exceeds 500ms for 5 minutes.
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="py-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <CardTitle className="text-base">Queue Saturation Critical</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-sm text-muted-foreground">
                  Triggered when queue depth reaches 90% capacity. Immediate action required.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* API Access */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Metrics API</h2>
          <p className="text-muted-foreground mb-6">
            Access queue metrics programmatically for custom monitoring integrations.
          </p>

          <CodeTabs examples={queueObservabilityExamples.examples} />
        </section>

        <Callout type="success" title="Pro Tip">
          Use the "Worker Utilization" metric to auto-scale your backend infrastructure.
          If utilization stays above 80%, consider adding more worker nodes.
        </Callout>
      </div>
    </div>
  );
}
