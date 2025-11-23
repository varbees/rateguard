"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/lib/store";
import { apiClient, DashboardStats, APIConfig } from "@/lib/api";
import {
  MetricCards,
  UsageGraphSection,
  APIListTable,
  RecentActivity,
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
  const { isAuthenticated, clearAuth } = useDashboardStore();

  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [apiList, setApiList] = React.useState<APIConfig[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [usageData, setUsageData] = React.useState(generateMockUsageData());
  const [recentRequests, setRecentRequests] = React.useState(
    generateMockRequests()
  );

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch stats using API client
      const statsData = await apiClient.getDashboardStats();
      setStats(statsData);

      // Fetch API list using API client
      const apisData = await apiClient.listAPIConfigs();
      setApiList(apisData);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    apiClient.clearApiKey();
    clearAuth();
    router.push("/login");
  };

  const handleRefreshData = () => {
    fetchDashboardData();
    setUsageData(generateMockUsageData());
    setRecentRequests(generateMockRequests());
  };

  const handleAddAPI = () => {
    router.push("/dashboard/apis/new");
  };

  const handleEditAPI = (api: APIConfig) => {
    router.push(`/dashboard/apis?edit=${api.id}`);
  };

  const handleViewStats = (api: APIConfig) => {
    router.push(`/dashboard/apis?stats=${api.id}`);
  };

  const handleToggleStatus = async (api: APIConfig) => {
    console.log("Toggle status for:", api.name);
    // Implement toggle logic
  };

  const handleDeleteAPI = async (api: APIConfig) => {
    if (confirm(`Are you sure you want to delete ${api.name}?`)) {
      console.log("Delete:", api.name);
      // Implement delete logic
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
        totalRequests24h: stats.total_requests || 0,
        successRate: stats.success_rate || 0,
        activeApis: stats.active_apis || apiList.length,
        avgResponseTime: stats.avg_response_time_ms || 0,
      }
    : null;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-destructive text-xl font-semibold">
            Error Loading Dashboard
          </div>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={fetchDashboardData} className="gap-2">
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
