"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useDashboardStats } from "@/lib/hooks/use-api";

export function TokenUsageWidget() {
  const { data: dashboardData } = useDashboardStats();
  
  // Fetch token usage (would come from actual endpoint)
  const { data: tokenData, isLoading } = useQuery({
    queryKey: ["dashboard", "tokens"],
    queryFn: async () => {
      // Placeholder - in production this would call GET /api/v1/dashboard/tokens
      const plan = dashboardData?.plan?.tier || "free";
      const limits: Record<string, number> = {
        free: 100000,
        starter: 10000000,
        pro: 100000000,
      };
      
      return {
        used: Math.floor(Math.random() * limits[plan] * 0.7), // Mock 70% usage
        limit: limits[plan],
        plan,
      };
    },
    enabled: !!dashboardData,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading || !tokenData) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-8 bg-muted rounded w-3/4" />
            <div className="h-2 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const usagePercentage = (tokenData.used / tokenData.limit) * 100;
  const isNearLimit = usagePercentage >= 80;
  const isOverLimit = usagePercentage >= 100;

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  return (
    <Card className={isNearLimit ? "border-orange-500" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Token Usage</CardTitle>
            <CardDescription>Monthly LLM token quota</CardDescription>
          </div>
          <Badge variant={isOverLimit ? "destructive" : isNearLimit ? "secondary" : "default"}>
            {tokenData.plan}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Usage Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Used</span>
            <span className="font-semibold">
              {formatTokens(tokenData.used)} / {formatTokens(tokenData.limit)}
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isOverLimit
                  ? "bg-red-500"
                  : isNearLimit
                  ? "bg-orange-500"
                  : "bg-primary"
              }`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {usagePercentage.toFixed(1)}% of monthly quota
          </p>
        </div>

        {/* Warning/Upgrade CTA */}
        {isNearLimit && (
          <div className={`p-3 rounded-lg ${isOverLimit ? "bg-red-50 dark:bg-red-950" : "bg-orange-50 dark:bg-orange-950"}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`size-4 mt-0.5 ${isOverLimit ? "text-red-600" : "text-orange-600"}`} />
              <div className="flex-1 space-y-2">
                <p className={`text-sm font-medium ${isOverLimit ? "text-red-900 dark:text-red-100" : "text-orange-900 dark:text-orange-100"}`}>
                  {isOverLimit ? "Quota Exceeded" : "Approaching Limit"}
                </p>
                <p className={`text-xs ${isOverLimit ? "text-red-800 dark:text-red-200" : "text-orange-800 dark:text-orange-200"}`}>
                  {isOverLimit 
                    ? "You've exceeded your monthly token quota. Upgrade to continue." 
                    : "You're approaching your token limit. Consider upgrading."}
                </p>
                {tokenData.plan !== "pro" && (
                  <Button size="sm" variant="secondary" className="w-full mt-2">
                    <Sparkles className="size-3 mr-2" />
                    Upgrade Plan
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Healthy State */}
        {!isNearLimit && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="size-4 text-green-500" />
            <span>Usage is healthy</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
