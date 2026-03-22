"use client";
import { useRouter } from "next/navigation";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { DashboardStatsData } from "@/lib/api";

interface UsageGuardrailsCardProps {
  stats: DashboardStatsData;
}

export function UsageGuardrailsCard({ stats }: UsageGuardrailsCardProps) {
  const router = useRouter();

  const requestUsagePercent =
    stats.plan_limit > 0 ? (stats.monthly_usage / stats.plan_limit) * 100 : 0;
  const requestWarning = requestUsagePercent >= 80;
  const anyCritical = requestUsagePercent >= 100;

  const handleReview = () => {
    router.push("/dashboard/budget");
  };

  return (
    <Card
      className={
        anyCritical
          ? "border-destructive"
          : requestWarning
          ? "border-yellow-500"
          : ""
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Usage Guardrails
            {requestWarning && (
              <AlertTriangle
                className={`size-5 ${
                  anyCritical ? "text-destructive" : "text-yellow-500"
                }`}
              />
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Protected APIs</span>
            <span className="font-medium">{stats.active_apis}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Active APIs are tracked directly from the dashboard stats feed.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Monthly Requests</span>
            <span className="font-medium">
              {formatNumber(stats.monthly_usage)} /{" "}
              {formatNumber(stats.plan_limit)}
            </span>
          </div>
          <Progress
            value={requestUsagePercent}
            className={`h-2 ${
              requestUsagePercent >= 100
                ? "[&>div]:bg-destructive"
                : requestUsagePercent >= 80
                ? "[&>div]:bg-yellow-500"
                : "[&>div]:bg-primary"
            }`}
          />
          {requestWarning && (
            <p className="text-xs text-muted-foreground">
              {requestUsagePercent >= 100
                ? "You have reached the monthly request budget."
                : `You're using ${Math.round(requestUsagePercent)}% of your monthly request budget.`}
            </p>
          )}
        </div>

        {(requestWarning || stats.active_apis > 0) && (
          <Button
            onClick={handleReview}
            className="w-full gap-2"
            variant={anyCritical ? "destructive" : "default"}
          >
            <TrendingUp className="size-4" />
            Review Usage Guardrails
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}
