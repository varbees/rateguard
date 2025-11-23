"use client";

import { useState } from "react";
import useSWR from "swr";
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

  const { data: apiData, mutate } = useSWR(
    `/api/v1/dashboard/streaming/by-api?period=${period}`,
    () => fetchStreamingByAPI(period)
  );

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
    mutate();
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
            <div className="flex items-center gap-2 bg-slate-800 rounded-lg border border-slate-700 p-1">
              {(["24h", "7d", "30d"] as TimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    period === p
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
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
                className="appearance-none bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 pr-10 text-sm font-medium text-slate-300 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All APIs</option>
                {apis.map((api) => (
                  <option key={api.api_id} value={api.api_id}>
                    {api.api_name}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden md:inline">Refresh</span>
            </button>

            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              disabled={apis.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Top Streaming APIs
            </h3>

            {apis.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p>No streaming data available for the selected period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">
                        API Name
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">
                        Streams
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">
                        Data
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">
                        Avg Duration
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">
                        Success Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {apis.map((api) => (
                      <tr
                        key={api.api_id}
                        className="hover:bg-slate-800 transition-colors"
                      >
                        <td className="py-3 px-4 text-sm font-medium text-white">
                          {api.api_name}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-slate-300">
                          {api.streams.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-slate-300">
                          {formatBytes(api.bytes)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-slate-300">
                          {formatDuration(api.avg_duration_ms)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              api.success_rate >= 99
                                ? "bg-green-500/20 text-green-400"
                                : api.success_rate >= 95
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
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
