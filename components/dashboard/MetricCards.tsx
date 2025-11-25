"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Activity, TrendingUp, Zap, Clock, HelpCircle } from "lucide-react";

interface MetricData {
  totalRequests24h: number;
  successRate: number;
  activeApis: number;
  avgResponseTime: number;
}

interface MetricCardsProps {
  data: MetricData | null;
  loading?: boolean;
}

const metrics = [
  {
    title: "Total Requests",
    subtitle: "Last 24 hours",
    icon: Activity,
    key: "totalRequests24h" as keyof MetricData,
    format: (value: number) => value.toLocaleString(),
    color: "text-primary",
    bgColor: "bg-primary/10",
    tooltip: "Total number of API requests in the last 24 hours",
  },
  {
    title: "Success Rate",
    subtitle: "Percentage",
    icon: TrendingUp,
    key: "successRate" as keyof MetricData,
    format: (value: number) => `${value.toFixed(1)}%`,
    color: "text-chart-4",
    bgColor: "bg-chart-4/20",
    tooltip: "Percentage of successful API requests (HTTP 2xx responses)",
    getStatusColor: (value: number) => {
      if (value >= 95) return "text-chart-4";
      if (value >= 80) return "text-chart-2";
      return "text-destructive";
    },
  },
  {
    title: "Active APIs",
    subtitle: "Currently enabled",
    icon: Zap,
    key: "activeApis" as keyof MetricData,
    format: (value: number) => value.toString(),
    color: "text-chart-3",
    bgColor: "bg-chart-3/20",
    tooltip: "Number of API configurations that are currently active",
  },
  {
    title: "Avg Response Time",
    subtitle: "Milliseconds",
    icon: Clock,
    key: "avgResponseTime" as keyof MetricData,
    format: (value: number) => `${value}ms`,
    color: "text-chart-5",
    bgColor: "bg-chart-5/20",
    tooltip: "Average response time across all API requests",
    getStatusColor: (value: number) => {
      if (value <= 200) return "text-chart-4";
      if (value <= 500) return "text-chart-2";
      return "text-destructive";
    },
  },
];

function MetricCardSkeleton() {
  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-24 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

export function MetricCards({ data, loading = false }: MetricCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric) => {
        const value = data?.[metric.key] ?? 0;
        const Icon = metric.icon;
        const statusColor = metric.getStatusColor?.(value) || metric.color;

        return (
          <Card
            key={metric.key}
            className="border-2 hover:shadow-lg transition-shadow"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.title}
                </CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`p-2 rounded-full ${metric.bgColor}`}>
                        <Icon className={`size-4 ${metric.color}`} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">{metric.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold mb-1 ${statusColor}`}>
                {metric.format(value)}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {metric.subtitle}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{metric.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
