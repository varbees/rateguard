"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchStreamingStats,
  formatBytes,
  formatDuration,
  type TimePeriod,
  type StreamingStats,
} from "@/lib/api/streaming";
import {
  Activity,
  Database,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface StreamingMetricsProps {
  period?: TimePeriod;
  className?: string;
}

export function StreamingMetrics({
  period = "30d",
  className = "",
}: StreamingMetricsProps) {
  const { data, error, isLoading } = useQuery<StreamingStats>({
    queryKey: [`/api/v1/dashboard/stats/streaming`, period],
    queryFn: () => fetchStreamingStats(period),
    refetchInterval: 5000, // Poll every 5 seconds
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  if (isLoading) {
    return <MetricsSkeleton />;
  }

  if (error) {
    return <MetricsError error={error} />;
  }

  // Use default values if no data
  const metrics = data || {
    total_streams: 0,
    active_streams: 0,
    total_bytes: 0,
    total_bytes_gb: 0,
    avg_duration_ms: 0,
    max_duration_ms: 0,
    success_rate: 0,
    streaming_enabled: false,
  };

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
    >
      {/* Total Streams */}
      <MetricCard
        title="Total Streams"
        value={metrics.total_streams.toLocaleString()}
        icon={<Activity className="w-5 h-5" />}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        tooltip="Total number of streaming requests in the selected period"
      />

      {/* Active Streams */}
      <MetricCard
        title="Active Streams"
        value={metrics.active_streams.toString()}
        icon={<Activity className="w-5 h-5 animate-pulse" />}
        iconColor="text-chart-4"
        iconBg="bg-chart-4/20"
        tooltip="Currently active streaming connections"
        pulse={metrics.active_streams > 0}
      />

      {/* Data Transferred */}
      <MetricCard
        title="Data Transferred"
        value={formatBytes(metrics.total_bytes)}
        subValue={`${metrics.total_bytes_gb.toFixed(2)} GB`}
        icon={<Database className="w-5 h-5" />}
        iconColor="text-chart-3"
        iconBg="bg-chart-3/20"
        tooltip="Total bytes transferred via streaming"
      />

      {/* Avg Duration */}
      <MetricCard
        title="Avg Duration"
        value={formatDuration(metrics.avg_duration_ms)}
        subValue={`Max: ${formatDuration(metrics.max_duration_ms)}`}
        icon={<Clock className="w-5 h-5" />}
        iconColor="text-chart-5"
        iconBg="bg-chart-5/20"
        tooltip="Average streaming request duration"
      />

      {/* Success Rate */}
      <MetricCard
        title="Success Rate"
        value={`${metrics.success_rate.toFixed(1)}%`}
        icon={<CheckCircle2 className="w-5 h-5" />}
        iconColor={
          metrics.success_rate >= 99
            ? "text-chart-4"
            : metrics.success_rate >= 95
            ? "text-chart-2"
            : "text-destructive"
        }
        iconBg={
          metrics.success_rate >= 99
            ? "bg-chart-4/20"
            : metrics.success_rate >= 95
            ? "bg-chart-2/20"
            : "bg-destructive/20"
        }
        tooltip="Percentage of successful streaming requests"
      />

      {/* Streaming Status */}
      <MetricCard
        title="Streaming Status"
        value={metrics.streaming_enabled ? "Enabled" : "Disabled"}
        icon={
          metrics.streaming_enabled ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )
        }
        iconColor={metrics.streaming_enabled ? "text-chart-4" : "text-muted-foreground"}
        iconBg={metrics.streaming_enabled ? "bg-chart-4/20" : "bg-muted/50"}
        tooltip="Current streaming feature status"
      />
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  tooltip: string;
  pulse?: boolean;
}

function MetricCard({
  title,
  value,
  subValue,
  icon,
  iconColor,
  iconBg,
  tooltip,
  pulse = false,
}: MetricCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg hover:border-border/80 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p
            className="text-sm font-medium text-muted-foreground mb-1"
            title={tooltip}
          >
            {title}
          </p>
          <p
            className={`text-2xl font-bold text-card-foreground ${
              pulse ? "animate-pulse" : ""
            }`}
          >
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
          )}
        </div>
        <div className={`${iconBg} ${iconColor} rounded-lg p-3`}>{icon}</div>
      </div>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div
      data-testid="metrics-skeleton"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-lg p-6 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-24 mb-2"></div>
              <div className="h-8 bg-muted rounded w-16"></div>
            </div>
            <div className="w-12 h-12 bg-muted rounded-lg"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricsError({ error }: { error: Error }) {
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
        <div>
          <h3 className="font-semibold text-destructive">
            Failed to load streaming metrics
          </h3>
          <p className="text-sm text-destructive/80 mt-1">{error.message}</p>
        </div>
      </div>
    </div>
  );
}

function MetricsEmpty() {
  return (
    <div className="bg-card border border-border rounded-lg p-12 text-center">
      <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="font-semibold text-card-foreground mb-2">
        No Streaming Data Yet
      </h3>
      <p className="text-sm text-muted-foreground">
        Start using streaming APIs to see metrics here
      </p>
    </div>
  );
}
