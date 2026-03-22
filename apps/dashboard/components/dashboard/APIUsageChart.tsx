"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimeRange = "24h" | "7d" | "30d";

interface UsageDataPoint {
  timestamp: number;
  date: string;
  requests: number;
}

interface APIUsageChartProps {
  data: UsageDataPoint[];
  loading?: boolean;
  isLive?: boolean;
}

export function APIUsageChart({ data, loading, isLive }: APIUsageChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  // Filter and format data based on selected time range
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const now = Date.now();
    const ranges = {
      "24h": 24 * 60 * 60 * 1000, // 24 hours in ms
      "7d": 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      "30d": 30 * 24 * 60 * 60 * 1000, // 30 days in ms
    };

    const cutoff = now - ranges[timeRange];
    
    return data
      .filter((point) => point.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data, timeRange]);

  // Calculate stats
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { total: 0, avg: 0, peak: 0 };
    }

    const total = chartData.reduce((sum, point) => sum + point.requests, 0);
    const avg = Math.round(total / chartData.length);
    const peak = Math.max(...chartData.map((p) => p.requests));

    return { total, avg, peak };
  }, [chartData]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">API Usage</CardTitle>
            {isLive && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Live
                </span>
              </div>
            )}
          </div>
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <TabsList className="bg-muted">
              <TabsTrigger value="24h" className="text-xs">
                24h
              </TabsTrigger>
              <TabsTrigger value="7d" className="text-xs">
                7d
              </TabsTrigger>
              <TabsTrigger value="30d" className="text-xs">
                30d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-foreground">
              {stats.total.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Average</p>
            <p className="text-xl font-bold text-foreground">
              {stats.avg.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Peak</p>
            <p className="text-xl font-bold text-primary flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              {stats.peak.toLocaleString()}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Loading chart...</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center space-y-2">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm text-muted-foreground">No usage data available</p>
              <p className="text-xs text-muted-foreground">
                Data will appear once API requests are made
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  padding: "8px 12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                itemStyle={{ color: "hsl(var(--primary))" }}
                formatter={(value: number) => [value.toLocaleString(), "Requests"]}
              />
              <Line
                type="monotone"
                dataKey="requests"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
