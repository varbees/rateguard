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
import {
  MetricCards,
  UsageGraphSection,
  APIListTable,
  RecentActivity,
  AlertBanner,
  CostEstimateCard,
  PlanLimitsCard,
} from "@/components/dashboard";
import { LogOut } from "lucide-react";

// Mock data generators for demo
function generateMockUsageData() {
  const data = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    data.push({
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      requests: Math.floor(Math.random() * 5000) + 1000,
      timestamp: date.getTime(),
    });
  }
  return data;
}

function generateMockRequests() {
  const methods = ["GET", "POST", "PUT", "DELETE"];
  const apis = ["stripe-api", "github-api", "openai-api", "twilio-api"];
  const paths = ["/users", "/payments", "/webhooks", "/messages", "/auth"];
  const statuses = [200, 200, 200, 201, 400, 429, 500];

  return Array.from({ length: 10 }, (_, i) => ({
    id: `req-${i}`,
    api_name: apis[Math.floor(Math.random() * apis.length)],
    method: methods[Math.floor(Math.random() * methods.length)],
    path: paths[Math.floor(Math.random() * paths.length)],
    status_code: statuses[Math.floor(Math.random() * statuses.length)],
    response_time_ms: Math.floor(Math.random() * 300) + 50,
    timestamp: new Date(Date.now() - i * 5 * 60 * 1000).toISOString(),
    error_message: Math.random() > 0.8 ? "Rate limit exceeded" : undefined,
  }));
}

export default function DashboardPage() {
  const router = useRouter();
  const { clearAuth } = useDashboardStore();

  // Data Fetching Hooks
  const { 
    data: stats, 
    isLoading: statsLoading, 
    error: statsError,
    refetch: refetchStats 
  } = useDashboardStats();

  const { 
    data: apiList = [], 
    isLoading: apisLoading, 
    error: apisError,
    refetch: refetchApis 
  } = useAPIConfigs();

  // Mutation Hooks
  const updateApiMutation = useUpdateAPIConfig();
  const deleteApiMutation = useDeleteAPIConfig();
  const logoutMutation = useLogout();

  const [usageData, setUsageData] = React.useState(generateMockUsageData());
  const [recentRequests, setRecentRequests] = React.useState(
    generateMockRequests()
  );

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
    setUsageData(generateMockUsageData());
    setRecentRequests(generateMockRequests());
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
      data: { enabled: !api.enabled } 
    });
  };

  const handleDeleteAPI = (api: APIConfig) => {
    if (confirm(`Are you sure you want to delete ${api.name}?`)) {
      deleteApiMutation.mutate(api.id);
    }
  };

  const handleViewRequestDetails = (request: {
    id: string;
    api_name: string;
    method: string;
    path: string;
    status_code: number;
    response_time_ms: number;
    timestamp: string;
    error_message?: string;
  }) => {
    console.log("View request details:", request);
    // Implement request details modal
  };

  // Transform stats for MetricCards
  const metricData = stats
    ? {
        totalRequests24h: stats.stats.total_requests || 0,
        successRate: stats.stats.success_rate || 0,
        activeApis: stats.stats.active_apis || apiList.length,
        avgResponseTime: stats.stats.avg_response_time_ms || 0,
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
          {/* Alert Banners */}
          <AlertBanner />

          {/* Plan Limits Card */}
          {stats && <PlanLimitsCard plan={stats.plan} stats={stats.stats} />}

          {/* Cost Estimate */}
          <CostEstimateCard />

          {/* Section 1: Metric Cards */}
          <MetricCards data={metricData} loading={loading} />

          {/* Section 2: Usage Graph */}
          <UsageGraphSection
            data={usageData}
            loading={loading}
            onRefresh={handleRefreshData}
          />

          {/* Section 3: API List */}
          <APIListTable
            apis={apiList}
            loading={loading}
            onAdd={handleAddAPI}
            onEdit={handleEditAPI}
            onViewStats={handleViewStats}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDeleteAPI}
          />

          {/* Section 4: Recent Activity */}
          <RecentActivity
            requests={recentRequests}
            loading={loading}
            onRefresh={handleRefreshData}
            onViewDetails={handleViewRequestDetails}
          />
        </div>
      </div>
    </div>
  );
}
