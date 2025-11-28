"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCircuitBreakerStats,
  useCircuitBreakerMetrics,
  useResetCircuitBreaker,
} from "@/lib/hooks/use-api";
import { CircuitBreakerMetrics, CircuitBreakerState } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Helper functions
function getStateColor(state: CircuitBreakerState): string {
  switch (state) {
    case "closed":
      return "text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400";
    case "open":
      return "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400";
    case "half-open":
      return "text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400";
    default:
      return "text-gray-600 bg-gray-50";
  }
}

function getStateIcon(state: CircuitBreakerState) {
  switch (state) {
    case "closed":
      return <CheckCircle className="size-4" />;
    case "open":
      return <XCircle className="size-4" />;
    case "half-open":
      return <Activity className="size-4" />;
    default:
      return <Activity className="size-4" />;
  }
}

function formatDuration(duration: string): string {
  // Duration comes as "5m30s" or "1h2m30s"
  return duration;
}

function formatPercentage(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

interface CircuitBreakerCardProps {
  apiId: string;
  metrics: CircuitBreakerMetrics;
  onReset: (apiId: string) => void;
  isResetting: boolean;
}

function CircuitBreakerCard({
  apiId,
  metrics,
  onReset,
  isResetting,
}: CircuitBreakerCardProps) {
  const successRate =
    metrics.total_requests > 0
      ? (metrics.total_successes / metrics.total_requests) * 100
      : 0;

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        metrics.state === "open" && "border-red-500/50 dark:border-red-500/30"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              {metrics.api_name}
            </CardTitle>
            <CardDescription className="text-xs">
              {apiId.slice(0, 8)}...
            </CardDescription>
          </div>
          <Badge className={cn("gap-1", getStateColor(metrics.state))}>
            {getStateIcon(metrics.state)}
            {metrics.state_string.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Total Requests</p>
            <p className="font-semibold">
              {metrics.total_requests.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Success Rate</p>
            <p
              className={cn(
                "font-semibold flex items-center gap-1",
                successRate >= 95
                  ? "text-green-600 dark:text-green-400"
                  : successRate >= 80
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {successRate.toFixed(1)}%
              {successRate >= 95 ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Failures</p>
            <p className="font-semibold text-red-600 dark:text-red-400">
              {metrics.total_failures}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Rejections</p>
            <p className="font-semibold text-orange-600 dark:text-orange-400">
              {metrics.total_rejections}
            </p>
          </div>
        </div>

        {/* State Details */}
        {metrics.state === "open" && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium mb-2">
              <AlertTriangle className="size-4" />
              <span>Circuit Breaker Open</span>
            </div>
            <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
              <div className="flex items-center gap-1">
                <Zap className="size-3" />
                <span>
                  Consecutive failures: {metrics.consecutive_failures}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="size-3" />
                <span>Open for: {formatDuration(metrics.time_in_state)}</span>
              </div>
            </div>
          </div>
        )}

        {metrics.state === "half-open" && (
          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 text-sm font-medium mb-2">
              <Activity className="size-4" />
              <span>Testing Recovery</span>
            </div>
            <div className="text-xs text-yellow-600 dark:text-yellow-400">
              <p>Consecutive successes: {metrics.consecutive_successes}</p>
            </div>
          </div>
        )}

        {/* State Transitions */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span>State transitions: {metrics.state_transitions}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            In state: {formatDuration(metrics.time_in_state)}
          </span>
        </div>

        {/* Reset Button (only for open circuits) */}
        {metrics.state === "open" && (
          <Button
            onClick={() => onReset(apiId)}
            disabled={isResetting}
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
          >
            <RefreshCw
              className={cn("size-3", isResetting && "animate-spin")}
            />
            {isResetting ? "Resetting..." : "Reset Circuit Breaker"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket/context";
import { toast } from "sonner";
import { queryKeys } from "@/lib/hooks/use-api";

export function CircuitBreakerMonitor() {
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();
  const { data: stats, isLoading: statsLoading } = useCircuitBreakerStats();
  const { data: metricsData, isLoading: metricsLoading } =
    useCircuitBreakerMetrics();
  const resetMutation = useResetCircuitBreaker();

  // Subscribe to real-time updates
  React.useEffect(() => {
    const unsubscribe = subscribe("circuit_breaker.state_change", (event) => {
      // Invalidate queries to fetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.circuitBreakerStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.circuitBreakerMetrics });
      
      const data = event.data as any;
      const state = data.state;
      const apiName = data.api_name;
      
      if (state === "open") {
        toast.error(`Circuit Breaker Opened: ${apiName}`, {
          description: "API is failing and requests are being rejected.",
        });
      } else if (state === "half-open") {
        toast.warning(`Circuit Breaker Half-Open: ${apiName}`, {
          description: "Testing API recovery with limited requests.",
        });
      } else if (state === "closed") {
        toast.success(`Circuit Breaker Closed: ${apiName}`, {
          description: "API has recovered and is operating normally.",
        });
      }
    });
    
    return unsubscribe;
  }, [subscribe, queryClient]);

  const handleReset = (apiId: string) => {
    resetMutation.mutate(apiId);
  };

  const loading = statsLoading || metricsLoading;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            Circuit Breakers
          </CardTitle>
          <CardDescription>
            Real-time monitoring of API circuit breakers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || !metricsData) {
    return null;
  }

  const { circuit_breaker_stats } = stats;
  const { metrics } = metricsData;

  // Convert metrics object to array
  const metricsArray = Object.entries(metrics).map(([apiId, metric]) => ({
    apiId,
    ...metric,
  }));

  // Show warning if no circuit breakers exist
  if (metricsArray.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            Circuit Breakers
          </CardTitle>
          <CardDescription>
            No circuit breakers active yet. They will appear here once APIs are
            called.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            Circuit Breaker Overview
          </CardTitle>
          <CardDescription>
            Real-time protection status across all APIs • Updates every 5s
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Activity className="size-4" />
                <span>Total Breakers</span>
              </div>
              <p className="text-2xl font-bold">
                {circuit_breaker_stats.total_circuit_breakers}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                <CheckCircle className="size-4" />
                <span>Closed (Healthy)</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {circuit_breaker_stats.closed_count}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                <XCircle className="size-4" />
                <span>Open (Failing)</span>
              </div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {circuit_breaker_stats.open_count}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 text-sm">
                <Activity className="size-4" />
                <span>Half-Open (Testing)</span>
              </div>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {circuit_breaker_stats.half_open_count}
              </p>
            </div>
          </div>

          {/* Success Rate */}
          <div className="mt-6 pt-4 border-t">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Total Requests</p>
                <p className="font-semibold text-lg">
                  {circuit_breaker_stats.total_requests.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Success Rate</p>
                <p className="font-semibold text-lg text-green-600 dark:text-green-400">
                  {formatPercentage(
                    circuit_breaker_stats.total_successes,
                    circuit_breaker_stats.total_requests
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Total Rejections</p>
                <p className="font-semibold text-lg text-orange-600 dark:text-orange-400">
                  {circuit_breaker_stats.total_rejections.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Open APIs Alert */}
          {circuit_breaker_stats.open_count > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-2">
                <AlertTriangle className="size-4" />
                <span>Open Circuit Breakers Detected</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400">
                {circuit_breaker_stats.open_count} API
                {circuit_breaker_stats.open_count > 1 ? "s are" : " is"}{" "}
                experiencing failures:{" "}
                {circuit_breaker_stats.open_apis.join(", ")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Circuit Breakers */}
      <div>
        <h3 className="text-lg font-semibold mb-4">API Circuit Breakers</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {metricsArray
            .sort((a, b) => {
              // Sort: open first, then half-open, then closed
              const stateOrder = { open: 0, "half-open": 1, closed: 2 };
              return stateOrder[a.state] - stateOrder[b.state];
            })
            .map((metric) => (
              <CircuitBreakerCard
                key={metric.apiId}
                apiId={metric.apiId}
                metrics={metric}
                onReset={handleReset}
                isResetting={resetMutation.isPending}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
