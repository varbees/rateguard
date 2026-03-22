"use client";

import * as React from "react";
import type { RecentRequest, UsageByAPI } from "@/lib/api";
import {
  useDashboardStats,
  useRecentRequests,
  useUsageHistory,
} from "@/lib/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  TrendingUp,
  Activity,
  Clock,
  Calendar,
  Download,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const API_USAGE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function calculateAverage(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculatePercentile(values: number[], percentile: number) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

function buildResponseTimeData(requests: RecentRequest[]) {
  if (requests.length === 0) return [];

  const sorted = [...requests].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const bucketCount = Math.min(6, sorted.length);
  const bucketSize = Math.ceil(sorted.length / bucketCount);

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucket = sorted.slice(index * bucketSize, (index + 1) * bucketSize);
    const durations = bucket.map((request) => request.response_time_ms);
    const label = bucket[0]
      ? new Date(bucket[0].timestamp).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : `Bucket ${index + 1}`;

    return {
      time: label,
      avg: calculateAverage(durations),
      p95: calculatePercentile(durations, 95),
      p99: calculatePercentile(durations, 99),
    };
  });
}

export default function UsagePage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: usageHistory, isLoading: usageHistoryLoading } =
    useUsageHistory("30d");
  const { data: recentRequests } = useRecentRequests({ limit: 200 });

  const isLoading = statsLoading || usageHistoryLoading;

  const usageOverTime = React.useMemo(() => {
    return (
      usageHistory?.data.map((point) => {
        const success = Math.round(point.requests * (point.success_rate / 100));

        return {
          date: new Date(point.timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          requests: point.requests,
          success,
          errors: Math.max(0, point.requests - success),
        };
      }) ?? []
    );
  }, [usageHistory]);

  const apiUsageBreakdown = React.useMemo(() => {
    const usageByApi: UsageByAPI[] = stats?.stats.usage_by_api ?? [];
    const totalRequests = stats?.stats.total_requests ?? 0;

    return usageByApi.map((api, index) => ({
      name: api.api_name,
      requests: api.requests,
      percentage:
        totalRequests > 0 ? (api.requests / totalRequests) * 100 : 0,
      colorClass: API_USAGE_COLORS[index % API_USAGE_COLORS.length],
    }));
  }, [stats]);

  const responseTimeData = React.useMemo(
    () => buildResponseTimeData(recentRequests?.requests ?? []),
    [recentRequests]
  );

  const usageByApi: UsageByAPI[] = stats?.stats.usage_by_api ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Usage Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Detailed insights into your API usage and performance
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="border-border text-foreground hover:bg-accent"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Last 30 Days
          </Button>
          <Button
            variant="outline"
            className="border-border text-foreground hover:bg-accent"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Requests
                </p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {isLoading
                    ? "..."
                    : (stats?.stats.total_requests || 0).toLocaleString()}
                </p>
                <p className="text-xs text-primary mt-1">
                  Live data from /api/v1/dashboard/stats
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <Activity className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Success Rate
                </p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {isLoading
                    ? "..."
                    : `${(stats?.stats.success_rate || 0).toFixed(1)}%`}
                </p>
                <p className="text-xs text-primary mt-1">
                  Same runtime contract the gateway exposes
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Avg Response Time
                </p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {isLoading
                    ? "..."
                    : `${(stats?.stats.avg_response_time_ms || 0).toFixed(0)}ms`}
                </p>
                <p className="text-xs text-destructive mt-1">
                  From the live dashboard stats endpoint
                </p>
              </div>
              <div className="p-3 rounded-lg bg-accent">
                <Clock className="w-6 h-6 text-accent-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Error Rate
                </p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {isLoading
                    ? "..."
                    : `${(100 - (stats?.stats.success_rate || 0)).toFixed(1)}%`}
                </p>
                <p className="text-xs text-primary mt-1">
                  Derived from the backend success rate
                </p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10">
                <BarChart3 className="w-6 h-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">
            Usage Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={usageOverTime}>
              <defs>
                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--chart-1))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--chart-1))"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--destructive))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--destructive))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="hsl(var(--chart-1))"
                fillOpacity={1}
                fill="url(#colorRequests)"
                name="Total Requests"
              />
              <Area
                type="monotone"
                dataKey="errors"
                stroke="hsl(var(--destructive))"
                fillOpacity={1}
                fill="url(#colorErrors)"
                name="Errors"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              API Usage Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {apiUsageBreakdown.map((api) => (
                <div
                  key={api.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: api.colorClass }}
                    />
                    <span className="text-foreground">{api.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-medium">
                      {api.requests.toLocaleString()}
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-secondary text-secondary-foreground"
                    >
                      {api.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Response Time Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={responseTimeData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  name="Average"
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  name="95th Percentile"
                />
                <Line
                  type="monotone"
                  dataKey="p99"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  name="99th Percentile"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {usageByApi.length > 0 ? (
              usageByApi.map((api, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-muted rounded-lg"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {api.api_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Last used: {new Date(api.last_used).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">
                      {api.requests.toLocaleString()} requests
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {api.success_rate.toFixed(1)}% success rate
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No recent activity
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
