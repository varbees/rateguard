"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PlanInfo, DashboardStatsData } from "@/lib/api";

interface PlanLimitsCardProps {
  plan: PlanInfo;
  stats: DashboardStatsData;
}

export function PlanLimitsCard({ plan, stats }: PlanLimitsCardProps) {
  const router = useRouter();

  // Calculate usage percentages
  const apiUsagePercent = (plan.limits.apis.used / plan.limits.apis.max) * 100;
  const requestUsagePercent = (stats.monthly_usage / stats.plan_limit) * 100;

  // Determine if user is approaching limits
  const apiWarning = apiUsagePercent >= 80;
  const requestWarning = requestUsagePercent >= 80;
  const anyCritical = apiUsagePercent >= 100 || requestUsagePercent >= 100;

  const handleUpgrade = () => {
    router.push("/dashboard/billing");
  };

  return (
    <Card
      className={
        anyCritical
          ? "border-destructive"
          : apiWarning || requestWarning
          ? "border-yellow-500"
          : ""
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Plan Usage
            {plan.tier !== "free" && (
              <Badge variant="outline" className="capitalize">
                {plan.tier}
              </Badge>
            )}
          </CardTitle>
          {(apiWarning || requestWarning) && (
            <AlertTriangle
              className={`size-5 ${
                anyCritical ? "text-destructive" : "text-yellow-500"
              }`}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API Limit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">APIs Created</span>
            <span className="font-medium">
              {plan.limits.apis.used} / {plan.limits.apis.max}
            </span>
          </div>
          <Progress
            value={apiUsagePercent}
            className={`h-2 ${
              apiUsagePercent >= 100
                ? "[&>div]:bg-destructive"
                : apiUsagePercent >= 80
                ? "[&>div]:bg-yellow-500"
                : "[&>div]:bg-primary"
            }`}
          />
          {apiUsagePercent >= 80 && (
            <p className="text-xs text-muted-foreground">
              {apiUsagePercent >= 100
                ? "❌ You've reached your API limit"
                : `⚠️ You're using ${Math.round(
                    apiUsagePercent
                  )}% of your API limit`}
            </p>
          )}
        </div>

        {/* Monthly Request Limit */}
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
          {requestUsagePercent >= 80 && (
            <p className="text-xs text-muted-foreground">
              {requestUsagePercent >= 100
                ? "❌ You've reached your monthly request limit"
                : `⚠️ You're using ${Math.round(
                    requestUsagePercent
                  )}% of your monthly limit`}
            </p>
          )}
        </div>

        {/* Plan Features Summary */}
        <div className="pt-4 border-t border-border space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Current Plan Features
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              {plan.features.advanced_analytics ? (
                <>
                  <span className="text-green-500">✓</span>
                  <span className="text-muted-foreground">
                    Advanced Analytics
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">✗</span>
                  <span className="text-muted-foreground line-through">
                    Advanced Analytics
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {plan.features.priority_support ? (
                <>
                  <span className="text-green-500">✓</span>
                  <span className="text-muted-foreground">
                    Priority Support
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">✗</span>
                  <span className="text-muted-foreground line-through">
                    Priority Support
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {plan.features.custom_rate_limits ? (
                <>
                  <span className="text-green-500">✓</span>
                  <span className="text-muted-foreground">Custom Limits</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">✗</span>
                  <span className="text-muted-foreground line-through">
                    Custom Limits
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {plan.features.webhooks ? (
                <>
                  <span className="text-green-500">✓</span>
                  <span className="text-muted-foreground">Webhooks</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">✗</span>
                  <span className="text-muted-foreground line-through">
                    Webhooks
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Upgrade CTA */}
        {(plan.tier === "free" || apiWarning || requestWarning) && (
          <Button
            onClick={handleUpgrade}
            className="w-full gap-2"
            variant={anyCritical ? "destructive" : "default"}
          >
            {plan.tier === "free" ? (
              <>
                <TrendingUp className="size-4" />
                Upgrade to Pro
              </>
            ) : anyCritical ? (
              <>
                <Zap className="size-4" />
                Upgrade Now
              </>
            ) : (
              <>
                <TrendingUp className="size-4" />
                Upgrade for More
              </>
            )}
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
