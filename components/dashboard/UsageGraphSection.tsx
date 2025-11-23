"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { BarChart3, RefreshCw } from "lucide-react";

interface UsageDataPoint {
  date: string;
  requests: number;
  timestamp: number;
}

interface UsageGraphSectionProps {
  data: UsageDataPoint[];
  loading?: boolean;
  onRefresh?: () => void;
}

type TimeRange = "24h" | "7d" | "30d";

function UsageGraphSkeleton() {
  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  );
}

function EmptyUsageState() {
  return (
    <div className="flex flex-col items-center justify-center h-[300px] text-center">
      <BarChart3 className="size-16 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold mb-2">No Usage Data Yet</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Start making API requests to see your usage patterns and trends
        visualized here.
      </p>
    </div>
  );
}

export function UsageGraphSection({
  data,
  loading = false,
  onRefresh,
}: UsageGraphSectionProps) {
  const [timeRange, setTimeRange] = React.useState<TimeRange>("7d");
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const [currentTime] = React.useState(() => Date.now());

  const filteredData = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    const timeRanges: Record<TimeRange, number> = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };

    const cutoff = currentTime - timeRanges[timeRange];
    return data.filter((point) => point.timestamp >= cutoff);
  }, [data, timeRange, currentTime]);

  const maxRequests = React.useMemo(() => {
    return Math.max(...filteredData.map((d) => d.requests), 0);
  }, [filteredData]);

  if (loading) {
    return <UsageGraphSkeleton />;
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              API Usage Over Time
            </CardTitle>
            <CardDescription className="mt-1.5">
              Track your API request volume and identify patterns
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
              {(["24h", "7d", "30d"] as TimeRange[]).map((range) => (
                <Button
                  key={range}
                  variant={timeRange === range ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange(range)}
                  className="h-8 px-3 text-xs"
                >
                  {range === "24h"
                    ? "24 Hours"
                    : range === "7d"
                    ? "7 Days"
                    : "30 Days"}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw
                className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredData.length === 0 ? (
          <EmptyUsageState />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={filteredData}>
              <defs>
                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                domain={[0, maxRequests * 1.1]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-lg">
                        <div className="text-sm font-semibold mb-1">
                          {payload[0].payload.date}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="size-2 rounded-full bg-primary" />
                          <span className="text-sm text-muted-foreground">
                            Requests:
                          </span>
                          <span className="text-sm font-bold">
                            {payload[0].value?.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRequests)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
