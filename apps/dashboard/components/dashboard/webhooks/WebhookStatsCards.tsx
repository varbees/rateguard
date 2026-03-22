"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Zap,
  AlertTriangle,
  MailCheck,
} from "lucide-react";
import { useWebhookStats } from "@/lib/hooks/use-webhooks";
import { cn } from "@/lib/utils";

// Animated counter that smoothly transitions between numbers
function AnimatedCounter({
  value,
  suffix = "",
  decimals = 0,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value === prevValue.current) return;

    const duration = 500;
    const startTime = Date.now();
    const startValue = prevValue.current;
    const diff = value - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + diff * eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
        prevValue.current = value;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span className="tabular-nums">
      {decimals > 0
        ? displayValue.toFixed(decimals)
        : Math.round(displayValue).toLocaleString()}
      {suffix}
    </span>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  suffix?: string;
  decimals?: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; isPositive: boolean };
  variant?: "default" | "success" | "warning" | "error";
  accentColor?: string;
}

function WebhookStatCard({
  title,
  value,
  suffix = "",
  decimals = 0,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  accentColor,
}: StatCardProps) {
  const variantStyles = {
    default: "from-blue-500/10 to-transparent border-blue-500/20",
    success: "from-emerald-500/10 to-transparent border-emerald-500/20",
    warning: "from-amber-500/10 to-transparent border-amber-500/20",
    error: "from-red-500/10 to-transparent border-red-500/20",
  };

  const iconColors = {
    default: "text-blue-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
    error: "text-red-500",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br p-5",
        "backdrop-blur-sm transition-all duration-300",
        "hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30",
        variantStyles[variant]
      )}
    >
      {/* Subtle glow effect */}
      <div
        className={cn(
          "absolute -top-12 -right-12 w-24 h-24 rounded-full blur-2xl opacity-20",
          variant === "success" && "bg-emerald-500",
          variant === "warning" && "bg-amber-500",
          variant === "error" && "bg-red-500",
          variant === "default" && "bg-blue-500"
        )}
      />

      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight">
              <AnimatedCounter
                value={value}
                suffix={suffix}
                decimals={decimals}
              />
            </span>
            {trend && (
              <span
                className={cn(
                  "text-xs font-medium flex items-center gap-0.5",
                  trend.isPositive ? "text-emerald-500" : "text-red-500"
                )}
              >
                <TrendingUp
                  className={cn("w-3 h-3", !trend.isPositive && "rotate-180")}
                />
                {trend.value}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70">{subtitle}</p>
        </div>

        <div
          className={cn(
            "p-2.5 rounded-lg bg-background/50 backdrop-blur-sm",
            iconColors[variant]
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

export function WebhookStatsCards() {
  // Use longer interval (30s) and don't show loading on refetch
  const { data: stats, isLoading, isFetching } = useWebhookStats(30000);

  // Calculate stats safely - handle null database_stats
  const dbStats = stats?.database_stats ?? {
    total: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
    dead_letter: 0,
  };

  const total = dbStats.total || 0;
  const delivered = dbStats.delivered || 0;
  const failed = dbStats.failed || 0;
  const pending = dbStats.pending || 0;
  const successRate = total > 0 ? (delivered / total) * 100 : 100;

  // Only show skeleton on initial load, not on background refetches
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 animate-pulse">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-8 w-16 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="h-10 w-10 bg-muted rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Subtle refetch indicator */}
      <AnimatePresence>
        {isFetching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -top-1 right-0 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Syncing...</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WebhookStatCard
          title="Total Events"
          value={total}
          subtitle="Last 30 days"
          icon={Activity}
          variant="default"
        />
        <WebhookStatCard
          title="Success Rate"
          value={successRate}
          suffix="%"
          decimals={1}
          subtitle="Delivery success"
          icon={MailCheck}
          variant={
            successRate >= 98
              ? "success"
              : successRate >= 90
              ? "warning"
              : "error"
          }
        />
        <WebhookStatCard
          title="Failed Events"
          value={failed}
          subtitle={failed === 0 ? "All clear!" : "Requires attention"}
          icon={failed === 0 ? CheckCircle2 : AlertTriangle}
          variant={failed === 0 ? "success" : "error"}
        />
        <WebhookStatCard
          title="In Progress"
          value={pending}
          subtitle="Currently processing"
          icon={Zap}
          variant={pending > 0 ? "warning" : "default"}
        />
      </div>
    </div>
  );
}
