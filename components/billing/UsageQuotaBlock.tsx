"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Zap, Database, AlertTriangle } from "lucide-react";
import { DashboardStatsData, PlanInfo } from "@/lib/api";

interface UsageQuotaBlockProps {
  stats: DashboardStatsData;
  plan: PlanInfo;
}

export function UsageQuotaBlock({ stats, plan }: UsageQuotaBlockProps) {
  const requestPercentage = Math.min(
    (stats.monthly_usage / plan.limits.requests.max) * 100,
    100
  );
  
  // Assuming we might have token usage in the future or mapped from somewhere else
  // For now, we'll focus on requests and APIs
  const apiPercentage = Math.min(
    (stats.active_apis / plan.limits.apis.max) * 100,
    100
  );

  const isNearLimit = requestPercentage > 80;
  const isOverLimit = requestPercentage >= 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">Usage & Quotas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Requests Quota */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Zap className="h-4 w-4" />
              Monthly Requests
            </span>
            <span className={isOverLimit ? "text-destructive font-bold" : ""}>
              {stats.monthly_usage.toLocaleString()} / {plan.limits.requests.max.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={requestPercentage} 
            className={isOverLimit ? "bg-destructive/20" : ""}
            // indicatorClassName={isOverLimit ? "bg-destructive" : isNearLimit ? "bg-yellow-500" : ""} 
            // Note: standard shadcn Progress component might not support indicatorClassName directly without customization
            // We'll rely on the default or custom CSS if needed, but for now standard Progress is fine.
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{requestPercentage.toFixed(1)}% used</span>
            {isNearLimit && (
              <span className="flex items-center gap-1 text-yellow-500">
                <AlertTriangle className="h-3 w-3" />
                {isOverLimit ? "Limit exceeded" : "Approaching limit"}
              </span>
            )}
          </div>
        </div>

        {/* API Quota */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Database className="h-4 w-4" />
              Active APIs
            </span>
            <span>
              {stats.active_apis} / {plan.limits.apis.max}
            </span>
          </div>
          <Progress value={apiPercentage} />
          <p className="text-xs text-muted-foreground text-right">
            {apiPercentage.toFixed(1)}% used
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
