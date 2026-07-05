"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useRateGuard, type HistoryPoint } from "@/lib/rateguard-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

const throughputConfig = {
  requestsPerSec: { label: "Requests/sec", color: "var(--chart-1)" },
  tokensPerSec: { label: "Tokens/sec", color: "var(--chart-2)" },
} satisfies ChartConfig;

const eventsConfig = {
  rateLimitDelta: { label: "Rate limit hits", color: "var(--chart-5)" },
  budgetDelta: { label: "Budget exhaustions", color: "var(--chart-3)" },
} satisfies ChartConfig;

function timeLabel(t: number) {
  return new Date(t).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" });
}

function withDeltas(history: HistoryPoint[]) {
  return history.map((point, i) => {
    const prev = history[i - 1];
    return {
      time: timeLabel(point.t),
      requestsPerSec: point.requestsPerSec,
      tokensPerSec: point.tokensPerSec,
      rateLimitDelta: prev ? Math.max(0, point.rateLimitHitsTotal - prev.rateLimitHitsTotal) : 0,
      budgetDelta: prev ? Math.max(0, point.tokenBudgetExhaustedTotal - prev.tokenBudgetExhaustedTotal) : 0,
    };
  });
}

export default function AnalyticsPage() {
  const { history, status } = useRateGuard();

  if (status !== "connected" && history.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const data = withDeltas(history);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Live throughput</CardTitle>
          <CardDescription>
            Requests and tokens per second, derived from cumulative counters polled every 3s. This
            is a live view since the dashboard was opened — for durable historical retention,
            scrape <code className="mono">/metrics</code> into Prometheus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length < 2 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Gathering data — needs at least two polls to chart a rate.
            </p>
          ) : (
            <ChartContainer config={throughputConfig} className="h-72 w-full">
              <AreaChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <defs>
                  <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-requestsPerSec)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-requestsPerSec)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-tokensPerSec)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-tokensPerSec)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="requestsPerSec"
                  type="monotone"
                  fill="url(#fillRequests)"
                  stroke="var(--color-requestsPerSec)"
                  strokeWidth={2}
                  isAnimationActive
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                <Area
                  dataKey="tokensPerSec"
                  type="monotone"
                  fill="url(#fillTokens)"
                  stroke="var(--color-tokensPerSec)"
                  strokeWidth={2}
                  isAnimationActive
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Denial events</CardTitle>
          <CardDescription>Rate limit hits and token budget exhaustions, per poll interval.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.length < 2 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Gathering data…</p>
          ) : (
            <ChartContainer config={eventsConfig} className="h-64 w-full">
              <BarChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={30} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="rateLimitDelta"
                  fill="var(--color-rateLimitDelta)"
                  radius={2}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="budgetDelta"
                  fill="var(--color-budgetDelta)"
                  radius={2}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
