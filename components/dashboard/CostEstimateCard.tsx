"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardAPI } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket/context";
import { DollarSign, TrendingUp, Calendar, Zap } from "lucide-react";

export function CostEstimateCard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["cost-estimate"],
    queryFn: dashboardAPI.costs,
    refetchInterval: 30000, // Fallback: refetch every 30s
  });

  // WebSocket integration for real-time cost updates
  const { subscribe, isConnected } = useWebSocket();

  React.useEffect(() => {
    const unsubscribe = subscribe("metrics.update", (event) => {
      // Refetch when costs are updated
      if (event.data?.cost_updated) {
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
            <DollarSign className="h-4 w-4" />
            API Cost Estimate
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
    return null;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  const hasTokenData = data.mtd_tokens && data.mtd_tokens > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            API Cost Estimate
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
          {/* Today's Cost */}
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Today&apos;s Cost
              </span>
            </div>
            <div className="text-lg font-bold text-blue-600">
              {formatCurrency(data.today_cost)}
            </div>
          </div>

          {/* Monthly Projection */}
          <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Monthly Projection
              </span>
            </div>
            <div className="text-lg font-bold text-purple-600">
              {formatCurrency(data.monthly_projection)}
            </div>
          </div>

          {/* Month-to-Date Stats */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>MTD Cost:</span>
              <span className="font-medium">
                {formatCurrency(data.mtd_cost)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
              <span>MTD Requests:</span>
              <span className="font-medium">
                {data.mtd_requests.toLocaleString()}
              </span>
            </div>
            {/* NEW: Token count if available */}
            {hasTokenData && (
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  MTD Tokens:
                </span>
                <span className="font-medium text-violet-600 dark:text-violet-400">
                  {formatNumber(data.mtd_tokens!)}
                </span>
              </div>
            )}
          </div>

          {/* API Breakdown (if available) */}
          {data.api_costs && data.api_costs.length > 0 && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Top APIs (Today)
              </div>
              <div className="space-y-1">
                {data.api_costs.slice(0, 3).map((apiCost) => (
                  <div
                    key={apiCost.api_id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[150px]">
                      {apiCost.api_name}
                    </span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {formatCurrency(apiCost.total_cost)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model Cost Breakdown (NEW) */}
          {hasTokenData && data.cost_by_model && Object.keys(data.cost_by_model).length > 0 && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                LLM Models (Month)
              </div>
              <div className="space-y-1">
                {Object.entries(data.cost_by_model)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 3)
                  .map(([model, cost]) => (
                    <div
                      key={model}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-gray-600 dark:text-gray-400 truncate max-w-[150px]">
                        {model}
                      </span>
                      <span className="font-medium text-violet-600 dark:text-violet-400">
                        {formatCurrency(cost as number)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Pricing Model Note */}
          <div className="pt-2 text-[10px] text-gray-500 dark:text-gray-500">
            {hasTokenData 
              ? "Dual pricing: Request-based + Token-based (per 1M tokens)" 
              : "Request-based pricing ($0.001-$0.002 per request)"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
