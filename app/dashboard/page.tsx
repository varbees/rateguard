"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";

interface API {
  id: string;
  name: string;
  target_url: string;
  rate_limit_per_second: number;
  burst_size: number;
  enabled: boolean;
  created_at: string;
}

interface APIListResponse {
  apis: API[];
}

interface DashboardStats {
  total_requests: number;
  apis_configured: number;
  success_rate: number;
  avg_response_time_ms: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, apiKey, logout } = useDashboardStore();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [apiList, setApiList] = useState<APIListResponse>({ apis: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    fetchDashboardData();
  }, [isAuthenticated, router]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch stats
      const statsResponse = await fetch(
        "http://localhost:8008/api/v1/dashboard/stats",
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!statsResponse.ok) {
        throw new Error("Failed to fetch stats");
      }

      const statsData = await statsResponse.json();
      setStats(statsData);

      // Fetch API list
      const apisResponse = await fetch("http://localhost:8008/api/v1/apis", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!apisResponse.ok) {
        throw new Error("Failed to fetch APIs");
      }

      const apisData = await apisResponse.json();

      // ✅ FIX: Handle both response formats
      if (Array.isArray(apisData)) {
        // If API returns array directly
        setApiList({ apis: apisData });
      } else if (apisData.apis && Array.isArray(apisData.apis)) {
        // If API returns { apis: [...] }
        setApiList(apisData);
      } else {
        // Fallback
        setApiList({ apis: [] });
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIX: Safe filtering with default empty array
  const activeApis = (apiList?.apis || []).filter((api) => api.enabled);
  const inactiveApis = (apiList?.apis || []).filter((api) => !api.enabled);

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
            onClick={logout}
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
                APIs Configured
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">
                {stats?.apis_configured || apiList.apis.length || "0"}
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
            {apiList.apis.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No APIs configured yet</p>
                <Button
                  onClick={() => router.push("/dashboard/apis")}
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
