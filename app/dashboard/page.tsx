"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/lib/store";
import { apiClient, APIConfig } from "@/lib/api";
import {
  useDashboardStats,
  useAPIConfigs,
  useUpdateAPIConfig,
  useDeleteAPIConfig,
  useLogout,
} from "@/lib/hooks/use-api";
import { useQuery } from "@tanstack/react-query";
import {
  MetricCards,
  UsageGraphSection,
  APIListTable,
  AlertBanner,
  // CostEstimateCard,
  CircuitBreakerMonitor,
  SystemHealthIndicator,
} from "@/components/dashboard";
import { LogOut } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { clearAuth } = useDashboardStore();

  // Data Fetching Hooks
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useDashboardStats();

  const {
    data: apiList = [],
    isLoading: apisLoading,
    error: apisError,
    refetch: refetchApis,
  } = useAPIConfigs();

  // Mutation Hooks
  const updateApiMutation = useUpdateAPIConfig();
  const deleteApiMutation = useDeleteAPIConfig();
  const logoutMutation = useLogout();

  // Fetch real-time usage data from backend
  const { data: usageResponse } = useQuery({
    queryKey: ["usage-history"],
    queryFn: () => apiClient.getUsageHistory("7d"),
  });

  // Transform API response to component format
  const usageData = React.useMemo(() => {
    if (!usageResponse?.data) return [];
    return usageResponse.data.map((point) => ({
      date: new Date(point.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      requests: point.requests,
      timestamp: new Date(point.timestamp).getTime(),
    }));
  }, [usageResponse]);

  const loading = statsLoading || apisLoading;
  const error = statsError || apisError;

  const handleLogout = async () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        clearAuth();
        window.location.href = "/login";
      },
      onError: (error) => {
        console.error("Logout failed:", error);
        // Force redirect even if logout fails
        window.location.href = "/login";
      },
    });
  };

  const handleRefreshData = () => {
    refetchStats();
    refetchApis();
  };

  const handleAddAPI = () => {
    router.push("/dashboard/apis/new");
  };

  const handleEditAPI = (api: APIConfig) => {
    router.push(`/dashboard/apis/${api.id}/edit`);
  };

  const handleViewStats = (api: APIConfig) => {
    router.push(`/dashboard/apis/${api.id}`);
  };

  const handleToggleStatus = (api: APIConfig) => {
    updateApiMutation.mutate({
      id: api.id,
      data: { enabled: !api.enabled },
    });
  };

  const handleDeleteAPI = (api: APIConfig) => {
    if (confirm(`Are you sure you want to delete ${api.name}?`)) {
      deleteApiMutation.mutate(api.id);
    }
  };

  // Transform stats for MetricCards
  const metricData = stats
    ? {
        totalRequests24h: stats.stats.total_requests || 0,
        successRate: stats.stats.success_rate || 0,
        activeApis: stats.stats.active_apis || apiList.length,
        avgResponseTime: stats.stats.avg_response_time_ms
          ? Number(stats.stats.avg_response_time_ms)
          : 0,
      }
    : null;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-destructive text-xl font-semibold">
            Error Loading Dashboard
          </div>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : "An error occurred"}
          </p>
          <Button onClick={handleRefreshData} className="gap-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage your protected APIs
            </p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="gap-2 w-full sm:w-auto"
          >
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>

        <div className="space-y-8">
          {/* Alert Banners - Real-time WebSocket updates */}
          <AlertBanner />
          
          {/* System Health Indicator - Real-time WebSocket updates */}
          <SystemHealthIndicator />

          {/* Cost Estimate - Real-time data */}
          {/* <CostEstimateCard /> */}

          {/* Section 1: Metric Cards */}
          <MetricCards data={metricData} loading={loading} />

          {/* Section 2: Usage Graph - Real-time WebSocket metrics */}
          <UsageGraphSection
            data={usageData}
            loading={loading}
            onRefresh={handleRefreshData}
          />

          {/* Section 3: Circuit Breaker Monitor - Real-time WebSocket updates */}
          <CircuitBreakerMonitor />

          {/* Section 4: API List - Real-time data */}
          <APIListTable
            apis={apiList}
            loading={loading}
            onAdd={handleAddAPI}
            onEdit={handleEditAPI}
            onViewStats={handleViewStats}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDeleteAPI}
          />
        </div>
      </div>
    </div>
  );
}
