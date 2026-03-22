"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchStreamingHistory,
  fetchStreamingByAPI,
  formatBytes,
  type TimePeriod,
} from "@/lib/api/streaming";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Database, Clock } from "lucide-react";

interface StreamingChartProps {
  period?: TimePeriod;
  chartType?: "line" | "bar" | "area";
  className?: string;
}

export function StreamingHistoryChart({
  period = "7d",
  className = "",
}: Omit<StreamingChartProps, "chartType">) {
  const { data, error, isLoading } = useQuery({
    queryKey: [`/api/v1/dashboard/streaming/history`, period],
    queryFn: () => fetchStreamingHistory(period),
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
  });

  const chartData = useMemo(() => {
    if (!data?.data) return [];

    return data.data.map((point) => ({
      timestamp: new Date(point.timestamp).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
      }),
      streams: point.streams,
      bytes_mb: (point.bytes / (1024 * 1024)).toFixed(2),
      duration_sec: (point.avg_duration_ms / 1000).toFixed(1),
    }));
  }, [data]);

  if (isLoading) {
    return <ChartSkeleton title="Streaming Activity Over Time" />;
  }

  if (error) {
    return <ChartError title="Streaming Activity Over Time" error={error} />;
  }

  if (!chartData || chartData.length === 0) {
    return (
      <ChartEmpty
        title="Streaming Activity Over Time"
        message="No streaming activity in this period"
      />
    );
  }

  return (
    <div
      className={`bg-card rounded-lg border border-border p-6 ${className}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-card-foreground">
            Streaming Activity Over Time
          </h3>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorStreams" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="streams"
            stroke="#3b82f6"
            fillOpacity={1}
            fill="url(#colorStreams)"
            name="Streams"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StreamingByAPIChart({
  period = "30d",
  className = "",
}: Omit<StreamingChartProps, "chartType">) {
  const { data, error, isLoading } = useQuery({
    queryKey: [`/api/v1/dashboard/streaming/by-api`, period],
    queryFn: () => fetchStreamingByAPI(period),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const chartData = useMemo(() => {
    if (!data?.apis) return [];

    return data.apis.map((api) => ({
      name:
        api.api_name.length > 20
          ? api.api_name.substring(0, 20) + "..."
          : api.api_name,
      streams: api.streams,
      bytes_mb: Number((api.bytes / (1024 * 1024)).toFixed(2)),
      duration_sec: Number((api.avg_duration_ms / 1000).toFixed(1)),
    }));
  }, [data]);

  if (isLoading) {
    return <ChartSkeleton title="Streaming by API" />;
  }

  if (error) {
    return <ChartError title="Streaming by API" error={error} />;
  }

  if (!chartData || chartData.length === 0) {
    return (
      <ChartEmpty
        title="Streaming by API"
        message="No APIs with streaming activity"
      />
    );
  }

  return (
    <div
      className={`bg-card rounded-lg border border-border p-6 ${className}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-chart-3" />
          <h3 className="text-lg font-semibold text-card-foreground">
            Bytes Transferred per API
          </h3>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: "MB", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number) => [`${value} MB`, "Bytes"]}
          />
          <Legend />
          <Bar
            dataKey="bytes_mb"
            fill="#9333ea"
            radius={[8, 8, 0, 0]}
            name="Data (MB)"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StreamingDurationChart({
  period = "30d",
  className = "",
}: Omit<StreamingChartProps, "chartType">) {
  const { data, error, isLoading } = useQuery({
    queryKey: [`/api/v1/dashboard/streaming/by-api`, period],
    queryFn: () => fetchStreamingByAPI(period),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const chartData = useMemo(() => {
    if (!data?.apis) return [];

    return data.apis.map((api) => ({
      name:
        api.api_name.length > 20
          ? api.api_name.substring(0, 20) + "..."
          : api.api_name,
      avg_duration: Number((api.avg_duration_ms / 1000).toFixed(2)),
      streams: api.streams,
    }));
  }, [data]);

  if (isLoading) {
    return <ChartSkeleton title="Average Stream Duration" />;
  }

  if (error) {
    return <ChartError title="Average Stream Duration" error={error} />;
  }

  if (!chartData || chartData.length === 0) {
    return (
      <ChartEmpty
        title="Average Stream Duration"
        message="No streaming duration data"
      />
    );
  }

  return (
    <div
      className={`bg-card rounded-lg border border-border p-6 ${className}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-chart-5" />
          <h3 className="text-lg font-semibold text-card-foreground">
            Average Stream Duration
          </h3>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: "Seconds", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number) => [`${value}s`, "Duration"]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="avg_duration"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name="Avg Duration (s)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Helper Components

function ChartSkeleton({ title }: { title: string }) {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="h-6 bg-muted rounded w-48 mb-6 animate-pulse"></div>
      <div className="h-[300px] bg-muted/50 rounded animate-pulse"></div>
    </div>
  );
}

function ChartError({ title, error }: { title: string; error: Error }) {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">{title}</h3>
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    </div>
  );
}

function ChartEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">{title}</h3>
      <div className="h-[300px] flex items-center justify-center bg-muted/30 rounded-lg">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
