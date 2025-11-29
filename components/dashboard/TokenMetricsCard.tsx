"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardAPI } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket/context";
import { Zap, TrendingUp, Layers } from "lucide-react";

export function TokenMetricsCard() {
  // Fetch initial data with React Query
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["token-usage"],
    queryFn: dashboardAPI.tokens,
    refetchInterval: 30000, // Fallback: refetch every 30s
  });

  // WebSocket integration for real-time updates
  const { subscribe, isConnected } = useWebSocket();

  React.useEffect(() => {
    // Subscribe to token usage updates via WebSocket
    const unsubscribe = subscribe("metrics.update", (event) => {
      // Refetch token data when metrics update
      if (event.data?.tokens_updated) {
        refetch();
      }
    });

    return unsubscribe;
  }, [subscribe, refetch]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            LLM Token Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            LLM Token Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No token usage data available yet. Start using LLM APIs to see metrics here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const topModels = Object.entries(data.by_model || {})
    .sort(([, a], [, b]) => b.tokens - a.tokens)
    .slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            LLM Token Usage
          </CardTitle>
          {isConnected && (
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
              Live
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Total Tokens */}
          <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950 rounded-lg">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tokens This Month
              </span>
            </div>
            <div className="text-lg font-bold text-violet-600">
              {formatNumber(data.total_tokens)}
            </div>
          </div>

          {/* Token Cost */}
          <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Token Cost
              </span>
            </div>
            <div className="text-lg font-bold text-emerald-600">
              {formatCurrency(data.total_cost_usd)}
            </div>
          </div>

          {/* Input/Output Breakdown */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>Input Tokens:</span>
              <span className="font-medium">{formatNumber(data.input_tokens)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
              <span>Output Tokens:</span>
              <span className="font-medium">{formatNumber(data.output_tokens)}</span>
            </div>
          </div>

          {/* Top Models by Usage */}
          {topModels.length > 0 && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Top Models
              </div>
              <div className="space-y-1">
                {topModels.map(([modelName, usage]) => (
                  <div
                    key={modelName}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[150px]">
                      {modelName}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-500">
                        {formatNumber(usage.tokens)}
                      </span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {formatCurrency(usage.cost_usd)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Period Info */}
          <div className="pt-2 text-[10px] text-gray-500 dark:text-gray-500">
            Month-to-date • Updates in real-time via WebSocket
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
