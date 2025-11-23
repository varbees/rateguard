"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ButtonLoading,
  ChartSkeleton,
  ShimmerTable,
  NewUserDashboard,
  NoAnalyticsData,
  NoAPIsConfigured,
  NoRequestsYet,
} from "@/components/loading";
import {
  MetricCards,
  UsageGraphSection,
  APIListTable,
  RecentActivity,
} from "@/components/dashboard";
import { Plus } from "lucide-react";

/**
 * Example Dashboard Component with Complete Loading & Empty States
 *
 * This demonstrates the complete integration of all loading and empty state
 * components in a real dashboard scenario.
 */

interface DashboardData {
  stats: {
    totalRequests24h: number;
    successRate: number;
    activeApis: number;
    avgResponseTime: number;
  } | null;
  apis: any[];
  usageData: any[];
  recentRequests: any[];
}

export function DashboardWithLoadingStates() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [data, setData] = React.useState<DashboardData>({
    stats: null,
    apis: [],
    usageData: [],
    recentRequests: [],
  });

  React.useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Simulate API calls
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // In real app: const data = await api.getDashboard();
      setData({
        stats: {
          totalRequests24h: 12543,
          successRate: 98.5,
          activeApis: 3,
          avgResponseTime: 145,
        },
        apis: [
          // Your API data here
        ],
        usageData: [
          // Your usage data here
        ],
        recentRequests: [
          // Your request logs here
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleAddAPI = () => {
    router.push("/dashboard/apis/new");
  };

  const handleViewDocs = () => {
    router.push("/docs");
  };

  // === LOADING STATE ===
  // Show skeleton loaders while fetching data
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-7xl mx-auto px-4 py-8">
          <div className="space-y-8">
            {/* Metric cards skeleton */}
            <MetricCards data={null} loading={true} />

            {/* Chart skeleton */}
            <ChartSkeleton showHeader={true} height={300} />

            {/* Table skeleton */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Your APIs</CardTitle>
              </CardHeader>
              <CardContent>
                <ShimmerTable rows={5} columns={4} />
              </CardContent>
            </Card>

            {/* Activity skeleton */}
            <RecentActivity requests={[]} loading={true} />
          </div>
        </div>
      </div>
    );
  }

  // === NEW USER STATE ===
  // Show welcome screen if user has no data at all
  const isNewUser = !data.stats?.totalRequests24h && data.apis.length === 0;

  if (isNewUser) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto px-4 py-16">
          <NewUserDashboard onAddAPI={handleAddAPI} />
        </div>
      </div>
    );
  }

  // === NORMAL DASHBOARD STATE ===
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Header with refresh button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage your protected APIs
            </p>
          </div>
          <div className="flex gap-3">
            <ButtonLoading
              variant="outline"
              loading={refreshing}
              loadingText="Refreshing..."
              onClick={handleRefresh}
            >
              Refresh Data
            </ButtonLoading>
            <Button onClick={handleAddAPI} className="gap-2">
              <Plus className="size-4" />
              Add API
            </Button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Metric Cards - shows stats or skeleton */}
          <MetricCards data={data.stats} loading={false} />

          {/* Usage Graph - shows chart, skeleton, or empty state */}
          {data.usageData.length > 0 ? (
            <UsageGraphSection
              data={data.usageData}
              loading={false}
              onRefresh={handleRefresh}
            />
          ) : (
            <NoAnalyticsData onViewDocs={handleViewDocs} />
          )}

          {/* API List - shows table, skeleton, or empty state */}
          {data.apis.length > 0 ? (
            <APIListTable
              apis={data.apis}
              loading={false}
              onAdd={handleAddAPI}
              onEdit={(api) => router.push(`/dashboard/apis?edit=${api.id}`)}
              onViewStats={(api) =>
                router.push(`/dashboard/apis?stats=${api.id}`)
              }
              onToggleStatus={(api) => console.log("Toggle", api)}
              onDelete={(api) => console.log("Delete", api)}
            />
          ) : (
            <NoAPIsConfigured
              onAddAPI={handleAddAPI}
              onViewDocs={handleViewDocs}
            />
          )}

          {/* Recent Activity - shows list, skeleton, or empty state */}
          {data.recentRequests.length > 0 ? (
            <RecentActivity
              requests={data.recentRequests}
              loading={false}
              onRefresh={handleRefresh}
              onViewDetails={(req) => console.log("View", req)}
            />
          ) : (
            <NoRequestsYet />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Usage Examples for Specific Scenarios
 */

// Example 1: Form with loading button
export function APIConfigFormExample() {
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // await api.saveConfig(data);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Form fields here */}
      <div className="flex gap-3">
        <ButtonLoading
          type="submit"
          loading={saving}
          loadingText="Saving Configuration..."
        >
          Save Configuration
        </ButtonLoading>
        <Button type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Example 2: Async action button
export function DeleteAPIButtonExample() {
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = async () => {
    if (!confirm("Are you sure?")) return;

    setDeleting(true);
    try {
      // await api.deleteAPI(id);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ButtonLoading
      variant="destructive"
      loading={deleting}
      loadingText="Deleting..."
      onClick={handleDelete}
    >
      Delete API
    </ButtonLoading>
  );
}

// Example 3: Table with shimmer loading
export function DataTableExample() {
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState([]);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    // await fetch data
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Request Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <ShimmerTable rows={10} columns={6} showHeader={true} />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return <NoRequestsYet />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request Logs</CardTitle>
      </CardHeader>
      <CardContent>{/* Your table here */}</CardContent>
    </Card>
  );
}
