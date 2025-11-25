"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { useDashboardStats } from "@/lib/hooks/use-api";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { PlanComparisonCards } from "@/components/billing/PlanComparisonCards";

export default function BillingPage() {
  const {
    data: dashboardData,
    isLoading,
    error,
  } = useDashboardStats();

  const plan = dashboardData?.plan;
  const stats = dashboardData?.stats;
  // Detect currency based on user location or plan
  // For now, default to USD. Backend will return detected_currency in future
  const currency = "USD";

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Billing & Plans
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription and billing information
          </p>
        </div>
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">
                Failed to load billing information
              </p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : "Please try again later"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Billing & Plans</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing information
        </p>
      </div>

      {/* Current Plan Card */}
      {plan?.tier !== "free" && plan && stats && (
        <CurrentPlanCard plan={plan} stats={stats} />
      )}

      {/* Plan Comparison Cards */}
      {plan && (
        <PlanComparisonCards
          currentTier={plan.tier}
          currency={currency}
          features={plan.features}
        />
      )}

      {/* Loading State */}
      {isLoading && (
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
              <div className="h-4 bg-muted rounded w-3/4"></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
