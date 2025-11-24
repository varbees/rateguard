"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StreamingMetrics } from "@/components/dashboard/StreamingMetrics";
import {
  StreamingHistoryChart,
  StreamingByAPIChart,
  StreamingDurationChart,
} from "@/components/dashboard/StreamingChart";
import { StreamingCostCalculator } from "@/components/dashboard/StreamingCostCalculator";
import {
  fetchStreamingByAPI,
  exportToCSV,
  formatBytes,
  formatDuration,
  type TimePeriod,
} from "@/lib/api/streaming";
import { Download, Filter, RefreshCw } from "lucide-react";

export default function StreamingDashboardPage() {
  const [period, setPeriod] = useState<TimePeriod>("30d");
  const [selectedAPI, setSelectedAPI] = useState<string>("all");

  const { data: apiData, refetch } = useQuery({
    queryKey: [`/api/v1/dashboard/streaming/by-api`, period],
    queryFn: () => fetchStreamingByAPI(period),
  });

  // Filter APIs for dropdown
  const apis = apiData?.apis || [];

  const handleExportCSV = () => {
    if (apis.length > 0) {
      const filename = `streaming-data-${period}-${
        new Date().toISOString().split("T")[0]
      }.csv`;
      exportToCSV(apis, filename);
    }
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Streaming Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor and analyze your streaming API usage
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <div className="flex items-center gap-2 bg-card rounded-lg border border-border p-1">
              {(["24h", "7d", "30d"] as TimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    period === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "24h"
                    ? "Last 24h"
                    : p === "7d"
                    ? "Last 7d"
                    : "Last 30d"}
                </button>
              ))}
            </div>

            {/* API Filter */}
            <div className="relative">
              <select
                value={selectedAPI}
                onChange={(e) => setSelectedAPI(e.target.value)}
                className="appearance-none bg-input border-input rounded-lg px-4 py-2 pr-10 text-sm font-medium text-foreground hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All APIs</option>
                {apis.map((api) => (
                  <option key={api.api_id} value={api.api_id}>
                    {api.api_name}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden md:inline">Refresh</span>
            </button>

            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              disabled={apis.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Export CSV</span>
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Metrics Cards */}
          <StreamingMetrics period={period} />

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StreamingHistoryChart period={period} />
            <StreamingByAPIChart period={period} />
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StreamingDurationChart period={period} />
            <StreamingCostCalculator />
          </div>

          {/* API Table */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-card-foreground mb-4">
              Top Streaming APIs
            </h3>

            {apis.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No streaming data available for the selected period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                        API Name
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                        Streams
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                        Data
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                        Avg Duration
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                        Success Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {apis.map((api) => (
                      <tr
                        key={api.api_id}
                        className="hover:bg-accent/50 transition-colors"
                      >
                        <td className="py-3 px-4 text-sm font-medium text-foreground">
                          {api.api_name}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-foreground">
                          {api.streams.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-foreground">
                          {formatBytes(api.bytes)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-foreground">
                          {formatDuration(api.avg_duration_ms)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              api.success_rate >= 99
                                ? "bg-primary/20 text-primary"
                                : api.success_rate >= 95
                                ? "bg-accent text-accent-foreground"
                                : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {api.success_rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
