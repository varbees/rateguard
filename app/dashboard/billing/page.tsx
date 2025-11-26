"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, TrendingUp, Activity, Zap } from "lucide-react";
import { useDashboardStats } from "@/lib/hooks/use-api";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";

export default function BillingPage() {
  const { data: dashboardData, isLoading, error } = useDashboardStats();

  const plan = dashboardData?.plan;
  const stats = dashboardData?.stats;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">
            View your usage and billing details
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
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">
          View your current usage and billing details
        </p>
      </div>

      {/* Current Usage & Plan Card */}
      {plan && stats && <CurrentPlanCard plan={plan} stats={stats} />}

      {/* Usage Breakdown Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Requests This Month */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Monthly Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.monthly_usage?.toLocaleString() || "0"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total this month
              </p>
            </CardContent>
          </Card>

          {/* Today's Requests */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                Today's Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.requests_today?.toLocaleString() || "0"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Requests today
              </p>
            </CardContent>
          </Card>

          {/* Active APIs */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Active APIs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.active_apis || "0"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Configured</p>
            </CardContent>
          </Card>

          {/* Success Rate */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-500" />
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {Math.round(stats.success_rate || 0)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardContent>
          </Card>
        </div>
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
