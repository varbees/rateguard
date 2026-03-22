"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Layers } from "lucide-react";
import { dashboardAPI } from "@/lib/api";

export function TokenUsageWidget() {
  const { data: tokenData, isLoading } = useQuery({
    queryKey: ["dashboard", "tokens"],
    queryFn: () => dashboardAPI.tokens(),
    refetchInterval: 60000,
  });

  if (isLoading || !tokenData) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-8 bg-muted rounded w-3/4" />
            <div className="h-2 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(2)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toLocaleString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const topModels = Object.entries(tokenData.by_model || {})
    .sort(([, a], [, b]) => (b?.tokens ?? 0) - (a?.tokens ?? 0))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Token Usage</CardTitle>
            <CardDescription>Month-to-date LLM token summary</CardDescription>
          </div>
          <Badge variant="outline">{tokenData.period}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950 rounded-lg">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Total Tokens
              </span>
            </div>
            <div className="text-lg font-bold text-violet-600">
              {formatTokens(tokenData.total_tokens)}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Token Cost
              </span>
            </div>
            <div className="text-lg font-bold text-emerald-600">
              {formatCurrency(tokenData.total_cost_usd)}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>Input Tokens:</span>
            <span className="font-medium">{formatTokens(tokenData.input_tokens)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
            <span>Output Tokens:</span>
            <span className="font-medium">{formatTokens(tokenData.output_tokens)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
            <span>Calculated At:</span>
            <span className="font-medium">
              {new Date(tokenData.calculated_at).toLocaleString()}
            </span>
          </div>
        </div>

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
                      {formatTokens(usage?.tokens ?? 0)}
                    </span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {formatCurrency(usage?.cost_usd ?? 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 text-[10px] text-gray-500 dark:text-gray-500">
          Live summary from /api/v1/dashboard/tokens
        </div>
      </CardContent>
    </Card>
  );
}
