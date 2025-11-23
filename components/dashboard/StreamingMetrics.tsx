"use client";

import useSWR from "swr";
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
  const { data, error, isLoading } = useSWR<StreamingStats>(
    `/api/v1/dashboard/stats/streaming?period=${period}`,
    () => fetchStreamingStats(period),
    {
      refreshInterval: 5000, // Poll every 5 seconds
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  if (isLoading) {
    return <MetricsSkeleton />;
  }

  if (error) {
    return <MetricsError error={error} />;
  }

  if (!data) {
    return <MetricsEmpty />;
  }

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
    >
      {/* Total Streams */}
      <MetricCard
        title="Total Streams"
        value={data.total_streams.toLocaleString()}
        icon={<Activity className="w-5 h-5" />}
        iconColor="text-blue-600"
        iconBg="bg-blue-50"
        tooltip="Total number of streaming requests in the selected period"
      />

      {/* Active Streams */}
      <MetricCard
        title="Active Streams"
        value={data.active_streams.toString()}
        icon={<Activity className="w-5 h-5 animate-pulse" />}
        iconColor="text-green-600"
        iconBg="bg-green-50"
        tooltip="Currently active streaming connections"
        pulse={data.active_streams > 0}
      />

      {/* Data Transferred */}
      <MetricCard
        title="Data Transferred"
        value={formatBytes(data.total_bytes)}
        subValue={`${data.total_bytes_gb.toFixed(2)} GB`}
        icon={<Database className="w-5 h-5" />}
        iconColor="text-purple-600"
        iconBg="bg-purple-50"
        tooltip="Total bytes transferred via streaming"
      />

      {/* Avg Duration */}
      <MetricCard
        title="Avg Duration"
        value={formatDuration(data.avg_duration_ms)}
        subValue={`Max: ${formatDuration(data.max_duration_ms)}`}
        icon={<Clock className="w-5 h-5" />}
        iconColor="text-orange-600"
        iconBg="bg-orange-50"
        tooltip="Average streaming request duration"
      />

      {/* Success Rate */}
      <MetricCard
        title="Success Rate"
        value={`${data.success_rate.toFixed(1)}%`}
        icon={<CheckCircle2 className="w-5 h-5" />}
        iconColor={
          data.success_rate >= 99
            ? "text-green-600"
            : data.success_rate >= 95
            ? "text-yellow-600"
            : "text-red-600"
        }
        iconBg={
          data.success_rate >= 99
            ? "bg-green-50"
            : data.success_rate >= 95
            ? "bg-yellow-50"
            : "bg-red-50"
        }
        tooltip="Percentage of successful streaming requests"
      />

      {/* Streaming Status */}
      <MetricCard
        title="Streaming Status"
        value={data.streaming_enabled ? "Enabled" : "Disabled"}
        icon={
          data.streaming_enabled ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )
        }
        iconColor={data.streaming_enabled ? "text-green-600" : "text-gray-400"}
        iconBg={data.streaming_enabled ? "bg-green-50" : "bg-gray-50"}
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
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 hover:shadow-lg hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p
            className="text-sm font-medium text-slate-400 mb-1"
            title={tooltip}
          >
            {title}
          </p>
          <p
            className={`text-2xl font-bold text-white ${
              pulse ? "animate-pulse" : ""
            }`}
          >
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-slate-500 mt-1">{subValue}</p>
          )}
        </div>
        <div className={`${iconBg} ${iconColor} rounded-lg p-3`}>{icon}</div>
      </div>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="bg-slate-900 border border-slate-800 rounded-lg p-6 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-4 bg-slate-800 rounded w-24 mb-2"></div>
              <div className="h-8 bg-slate-800 rounded w-16"></div>
            </div>
            <div className="w-12 h-12 bg-slate-800 rounded-lg"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricsError({ error }: { error: Error }) {
  return (
    <div className="bg-red-950/50 border border-red-900/50 rounded-lg p-6">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
        <div>
          <h3 className="font-semibold text-red-400">
            Failed to load streaming metrics
          </h3>
          <p className="text-sm text-red-300/80 mt-1">{error.message}</p>
        </div>
      </div>
    </div>
  );
}

function MetricsEmpty() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center">
      <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
      <h3 className="font-semibold text-slate-300 mb-2">
        No Streaming Data Yet
      </h3>
      <p className="text-sm text-slate-400">
        Start using streaming APIs to see metrics here
      </p>
    </div>
  );
}
