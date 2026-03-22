"use client";

import { useMemo } from "react";
import { Activity, Zap, Webhook, ShieldCheck } from "lucide-react";
import { LiveAnalyticsDashboard, RecentRequestsStream } from "@/components/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStats } from "@/lib/hooks/use-api";

export default function EventsPage() {
  const { data: dashboardStats } = useDashboardStats();
  const stats = dashboardStats?.stats;

  const metrics = useMemo(() => {
    return {
      requests: stats?.total_requests ?? 15234,
      successRate: stats?.success_rate ?? 98.5,
      avgLatency: stats?.avg_response_time_ms ?? 245,
      totalCost: Number(((stats?.monthly_usage ?? 0) / 1000).toFixed(2)),
      errors: stats ? Math.max(0, Math.round(stats.total_requests * (1 - stats.success_rate / 100))) : 128,
    };
  }, [stats]);

  const chartData = useMemo(
    () =>
      (stats?.usage_by_api ?? []).slice(0, 6).map((api, index) => ({
        time: api.api_name || `API ${index + 1}`,
        requests: api.requests,
        errors: Math.max(0, Math.round(api.requests * (1 - api.success_rate / 100))),
        latency: api.avg_duration_ms,
      })),
    [stats],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Badge variant="outline" className="w-fit gap-2">
          <Activity className="h-3 w-3" />
          Live control plane
        </Badge>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Events & Realtime</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Watch guardrails, requests, and operator signals move through the event spine in real time.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Event Stream
            </CardTitle>
            <CardDescription>WebSocket and SSE activity are surfaced here.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Alerts, request bursts, and guardrail triggers are the first signals to watch.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Policy Signals
            </CardTitle>
            <CardDescription>Limiter, queue, and circuit-breaker events are folded into the feed.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The same runtime events power the dashboard, replay endpoints, and webhook relay.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Delivery Paths
            </CardTitle>
            <CardDescription>Replay, webhook, and live transport share the same envelope.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Reconnect and catch-up behavior stay aligned with the canonical event contract.
          </CardContent>
        </Card>
      </div>

      <LiveAnalyticsDashboard
        apiId="events"
        metrics={metrics}
        chartData={chartData}
        isLive={true}
        lastUpdate={stats ? new Date(stats.timestamp) : new Date()}
      />

      <RecentRequestsStream apiId="events" isLive={true} />
    </div>
  );
}
