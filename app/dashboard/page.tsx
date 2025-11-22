"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";
import { apiClient, DashboardStats, APIConfig } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, clearAuth } = useDashboardStore();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [apiList, setApiList] = useState<APIConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  // Safe filtering with default empty array
  const activeApis = apiList.filter((api) => api.enabled);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Card className="bg-slate-900 border-slate-800 max-w-md">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-300">{error}</p>
            <Button
              onClick={fetchDashboardData}
              className="mt-4 bg-blue-500 hover:bg-blue-600"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Logout
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-400 text-sm">
                Total Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">
                {stats?.total_requests?.toLocaleString() || "0"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-400 text-sm">
                Active APIs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">
                {stats?.active_apis || apiList.length || "0"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-400 text-sm">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">
                {stats?.success_rate?.toFixed(1) || "0"}%
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-400 text-sm">
                Avg Response Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">
                {stats?.avg_response_time_ms || "0"}ms
              </p>
            </CardContent>
          </Card>
        </div>

        {/* API List */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-white">Your APIs</CardTitle>
              <Button
                onClick={() => router.push("/dashboard/apis")}
                className="bg-blue-500 hover:bg-blue-600"
              >
                Manage APIs
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {apiList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No APIs configured yet</p>
                <Button
                  onClick={() => router.push("/dashboard/apis?modal=open")}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  Add Your First API
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeApis.map((api) => (
                  <div
                    key={api.id}
                    className="flex justify-between items-center p-4 bg-slate-800 rounded-lg"
                  >
                    <div>
                      <h3 className="text-white font-medium">{api.name}</h3>
                      <p className="text-slate-400 text-sm">{api.target_url}</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
                        Active
                      </span>
                      <span className="text-xs text-slate-400">
                        {api.rate_limit_per_second} req/s
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
