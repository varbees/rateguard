"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Loader2 } from "lucide-react";
import { useGeo } from "@/hooks/use-geo";

interface PlanInfo {
  tier: string;
  features: {
    max_apis: number;
    max_requests_per_day: number;
    max_requests_per_month: number;
    advanced_analytics: boolean;
    priority_support: boolean;
    custom_rate_limits: boolean;
    webhooks: boolean;
    api_access: boolean;
  };
  limits: {
    apis: { used: number; max: number };
    requests: { used: number; max: number };
  };
}

interface CurrentPlanCardProps {
  plan: PlanInfo;
  stats: {
    total_requests: number;
    requests_today: number;
    monthly_usage: number;
    usage_percentages: {
      daily_pct: number;
      monthly_pct: number;
    };
  };
}

const planColors = {
  free: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  pro: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  business: "bg-purple-500/10 text-purple-700 border-purple-500/20",
};

const planLabels = {
  free: "Free Plan",
  pro: "Pro Plan",
  business: "Business Plan",
};

export function CurrentPlanCard({ plan, stats }: CurrentPlanCardProps) {
  const { Provider: geoProvider } = useGeo();
  const [isLoadingPortal, setIsLoadingPortal] = React.useState(false);
  const [portalError, setPortalError] = React.useState<string | null>(null);

  const planColor =
    planColors[plan.tier as keyof typeof planColors] || planColors.free;
  const planLabel =
    planLabels[plan.tier as keyof typeof planLabels] || "Free Plan";

  const requestsUsedPercent =
    plan.limits.requests.max > 0
      ? (stats.requests_today / plan.limits.requests.max) * 100
      : 0;

  const apisUsedPercent =
    plan.limits.apis.max > 0
      ? (plan.limits.apis.used / plan.limits.apis.max) * 100
      : 0;

  const isNearLimit = requestsUsedPercent > 80 || apisUsedPercent > 80;

  const handleManageSubscription = async () => {
    try {
      setPortalError(null);
      setIsLoadingPortal(true);

      // Determine provider based on plan tier
      const provider = geoProvider || "stripe";

      // Call backend portal endpoint
      const response = await fetch(`/api/v1/billing/${provider}/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": localStorage.getItem("apiKey") || "",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: "Failed to open management portal",
        }));
        throw new Error(errorData.message || "Portal access failed");
      }

      const data = await response.json();
      const portalUrl = data.portal_url || data.url;

      if (!portalUrl) {
        throw new Error("No portal URL received from server");
      }

      // Open portal in new tab
      window.open(portalUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setPortalError(message);
      console.error("Portal error:", err);
    } finally {
      setIsLoadingPortal(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground">Current Plan</CardTitle>
          <Badge className={planColor}>{planLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Daily Requests */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Today&apos;s Requests
              </p>
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(requestsUsedPercent)}%
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats.requests_today.toLocaleString()} /{" "}
              {plan.limits.requests.max.toLocaleString()}
            </p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  requestsUsedPercent > 80 ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${Math.min(requestsUsedPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Monthly Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Monthly Usage</p>
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(stats.usage_percentages.monthly_pct)}%
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats.monthly_usage.toLocaleString()} /{" "}
              {plan.limits.requests.max.toLocaleString()}
            </p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-chart-2 transition-all"
                style={{
                  width: `${Math.min(
                    stats.usage_percentages.monthly_pct,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* APIs Configured */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">APIs Configured</p>
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(apisUsedPercent)}%
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {plan.limits.apis.used} / {plan.limits.apis.max}
            </p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  apisUsedPercent > 80 ? "bg-destructive" : "bg-chart-3"
                }`}
                style={{ width: `${Math.min(apisUsedPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Alert for near limit */}
        {isNearLimit && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive text-sm">
                Approaching Plan Limit
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Consider upgrading your plan to avoid service interruptions.
              </p>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground mb-3">
            Plan Features
          </p>
          <div className="grid grid-cols-2 gap-2">
            {plan.features.advanced_analytics && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Advanced Analytics
              </div>
            )}
            {plan.features.priority_support && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Priority Support
              </div>
            )}
            {plan.features.custom_rate_limits && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Custom Rate Limits
              </div>
            )}
            {plan.features.webhooks && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Webhooks
              </div>
            )}
            {plan.features.api_access && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                API Access
              </div>
            )}
          </div>
        </div>

        {/* Portal Error */}
        {portalError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-xs text-destructive">{portalError}</p>
            <button
              onClick={() => setPortalError(null)}
              className="text-xs text-destructive/70 hover:text-destructive mt-1 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleManageSubscription}
            disabled={isLoadingPortal}
          >
            {isLoadingPortal ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Opening...
              </>
            ) : (
              "Manage Subscription"
            )}
          </Button>
          <Button className="flex-1">Upgrade Plan</Button>
        </div>
      </CardContent>
    </Card>
  );
}
