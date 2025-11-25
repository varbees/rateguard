"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardAPI } from "@/lib/api";
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Mock data for detailed analytics
const usageOverTime = [
  { date: "2025-11-15", requests: 1200, success: 1150, errors: 50 },
  { date: "2025-11-16", requests: 1800, success: 1720, errors: 80 },
  { date: "2025-11-17", requests: 2200, success: 2100, errors: 100 },
  { date: "2025-11-18", requests: 1900, success: 1820, errors: 80 },
  { date: "2025-11-19", requests: 2500, success: 2400, errors: 100 },
  { date: "2025-11-20", requests: 2800, success: 2700, errors: 100 },
  { date: "2025-11-21", requests: 3200, success: 3100, errors: 100 },
];

const apiUsageBreakdown = [
  {
    name: "JSONPlaceholder",
    requests: 770,
    percentage: 45,
    colorClass: "bg-chart-1",
  },
  {
    name: "Stripe API",
    requests: 520,
    percentage: 30,
    colorClass: "bg-chart-3",
  },
  {
    name: "GitHub API",
    requests: 340,
    percentage: 20,
    colorClass: "bg-chart-2",
  },
  {
    name: "Others",
    requests: 85,
    percentage: 5,
    colorClass: "bg-muted-foreground",
  },
];

const responseTimeData = [
  { time: "00:00", avg: 120, p95: 180, p99: 250 },
  { time: "04:00", avg: 110, p95: 160, p99: 220 },
  { time: "08:00", avg: 140, p95: 200, p99: 280 },
  { time: "12:00", avg: 160, p95: 240, p99: 320 },
  { time: "16:00", avg: 150, p95: 220, p99: 300 },
  { time: "20:00", avg: 130, p95: 190, p99: 260 },
];

export default function UsagePage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardAPI.stats,
    refetchInterval: 30000,
  });

  const { data: usage } = useQuery({
    queryKey: ["dashboard-usage"],
    queryFn: dashboardAPI.usage,
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Key Metrics */}
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
                  +12% from last month
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
                  +2.1% from last month
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
                  +5ms from last month
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
                  -0.8% from last month
                </p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10">
                <BarChart3 className="w-6 h-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Over Time */}
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

      {/* API Usage Breakdown and Response Times */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Usage Breakdown */}
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
                    <div className={`w-3 h-3 rounded-full ${api.colorClass}`} />
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
                      {api.percentage}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Response Time Trends */}
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

      {/* Recent Activity */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats?.stats.usage_by_api && stats.stats.usage_by_api.length > 0 ? (
              stats.stats.usage_by_api.map((api, index) => (
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
