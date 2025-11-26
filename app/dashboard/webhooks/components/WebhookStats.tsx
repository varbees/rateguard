"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock,
  TrendingUp,
  Zap,
  type LucideIcon
} from "lucide-react";
import { useWebhookStats } from "../hooks/useWebhookStats";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  className?: string;
}

function StatCard({ title, value, subtitle, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
            {trend && (
              <span
                className={cn(
                  "text-xs font-medium flex items-center gap-0.5",
                  trend.direction === "up"
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                <TrendingUp className={cn("h-3 w-3", trend.direction === "down" && "rotate-180")} />
                {trend.value}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="rounded-lg bg-primary/10 p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-11 w-11 rounded-lg" />
      </div>
    </Card>
  );
}

export function WebhookStats() {
  const { data: stats, isLoading, isError } = useWebhookStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Failed to load webhook statistics</p>
      </Card>
    );
  }

  const { database_stats, worker_metrics } = stats;
  const successRate = database_stats.total > 0
    ? ((database_stats.delivered / database_stats.total) * 100).toFixed(1)
    : "0";

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Events (24h)"
        value={database_stats.last_24h.toLocaleString()}
        subtitle={`${database_stats.total.toLocaleString()} all time`}
        icon={Activity}
      />
      
      <StatCard
        title="Delivered"
        value={database_stats.delivered.toLocaleString()}
        subtitle={`${successRate}% success rate`}
        icon={CheckCircle2}
        className="border-green-500/20"
      />
      
      <StatCard
        title="Failed"
        value={database_stats.failed.toLocaleString()}
        subtitle={`${database_stats.dead_letter} dead letter`}
        icon={XCircle}
        className="border-orange-500/20"
      />
      
      <StatCard
        title="Pending"
        value={database_stats.pending.toLocaleString()}
        subtitle={`${database_stats.processing} processing`}
        icon={Clock}
        className="border-blue-500/20"
      />
    </div>
  );
}

export function WebhookWorkerMetrics() {
  const { data: stats, isLoading } = useWebhookStats();

  if (isLoading || !stats) {
    return null;
  }

  const { worker_metrics, config } = stats;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Worker Metrics</h3>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-sm text-muted-foreground">Active Workers</p>
          <p className="text-2xl font-bold">{worker_metrics.worker_count}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground">Delivery Attempts</p>
          <p className="text-2xl font-bold">{worker_metrics.delivery_attempts.toLocaleString()}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground">Success Rate</p>
          <p className="text-2xl font-bold">
            {worker_metrics.delivery_attempts > 0
              ? ((worker_metrics.successful_deliveries / worker_metrics.delivery_attempts) * 100).toFixed(1)
              : "0"}%
          </p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground">Max Retries</p>
          <p className="text-2xl font-bold">{config.max_retries}</p>
        </div>
      </div>
    </Card>
  );
}
