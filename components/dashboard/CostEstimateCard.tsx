"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardAPI } from "@/lib/api";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";

export function CostEstimateCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["cost-estimate"],
    queryFn: dashboardAPI.costs,
  });

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          API Cost Estimate
        </CardTitle>
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

          {/* Hardcoded Rates Note */}
          <div className="pt-2 text-[10px] text-gray-500 dark:text-gray-500">
            Estimates based on hardcoded rates (OpenAI: $0.002/req, Claude:
            $0.0015/req)
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
