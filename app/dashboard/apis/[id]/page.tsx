"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ArrowLeft,
  TrendingUp,
  Loader2,
  CheckCircle2,
  Download,
  Edit,
  Upload,
  Activity,
} from "lucide-react";
import { UsageProgressBar } from "@/components/dashboard/UsageProgressBar";
import { ProxyURLCard } from "@/components/dashboard/ProxyURLCard";
import { QuickSettingsPanel } from "@/components/dashboard/QuickSettingsPanel";
import { DangerZone } from "@/components/dashboard/DangerZone";
import { LiveAnalyticsDashboard } from "@/components/dashboard/LiveAnalyticsDashboard";
import { RecentRequestsStream } from "@/components/dashboard/RecentRequestsStream";
import { APIKeysManagement } from "@/components/dashboard/APIKeysManagement";
import { useAPIConfig, useDashboardStats, useUpdateAPI, useDeleteAPI } from "@/lib/hooks/use-api";
import { SkeletonAPIDetail, APIUsageChart } from "@/components/dashboard";
import { useAPIMetricsWebSocket } from "@/lib/hooks/use-api-metrics-websocket";
import { toast } from "sonner";

interface RateLimitSuggestion {
  api_id: string;
  api_name: string;
  suggested_per_second?: number;
  suggested_per_minute?: number;
  suggested_per_hour?: number;
  suggested_per_day?: number;
  current_per_second: number;
  current_per_minute: number;
  current_per_hour: number;
  current_per_day: number;
  confidence_score: number;
  observation_count: number;
  last_observed_at: string;
  recommendation_reason: string;
}

function RateLimitSuggestions({ apiId }: { apiId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: suggestion, isLoading } = useQuery({
    queryKey: ["rate-limit-suggestions", apiId],
    queryFn: async () => {
      const response = await apiClient.getRateLimitSuggestions(apiId);
      return response.suggestion as RateLimitSuggestion | null;
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => apiClient.applyRateLimitSuggestions(apiId),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Rate limits updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["apiConfigs", apiId] });
      queryClient.invalidateQueries({
        queryKey: ["rate-limit-suggestions", apiId],
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to apply suggestions",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Loading suggestions...
          </span>
        </div>
      </Card>
    );
  }

  if (!suggestion || !suggestion.suggested_per_second) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold mb-2">Rate Limit Discovery</h3>
            <p className="text-sm text-muted-foreground">
              No rate limit observations yet. RateGuard will automatically
              detect limits from 429 responses and display suggestions here.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80)
      return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400";
    if (score >= 60)
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400";
    return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400";
  };

  const hasSuggestions =
    suggestion.suggested_per_second ||
    suggestion.suggested_per_minute ||
    suggestion.suggested_per_hour ||
    suggestion.suggested_per_day;

  return (
    <Card className="p-6 border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold">📊 Discovered Rate Limits</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Based on {suggestion.observation_count} observation
              {suggestion.observation_count !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Badge className={getConfidenceColor(suggestion.confidence_score)}>
          {suggestion.confidence_score}% confidence
        </Badge>
      </div>

      {hasSuggestions && (
        <div className="space-y-3 mb-4">
          {suggestion.suggested_per_second && (
            <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium">Per-second limit:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Current: {suggestion.current_per_second}
                </span>
                <span className="text-sm font-semibold text-blue-600">
                  → Suggested: {suggestion.suggested_per_second}
                </span>
              </div>
            </div>
          )}

          {suggestion.suggested_per_minute && (
            <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium">Per-minute limit:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Current: {suggestion.current_per_minute}
                </span>
                <span className="text-sm font-semibold text-blue-600">
                  → Suggested: {suggestion.suggested_per_minute}
                </span>
              </div>
            </div>
          )}

          {suggestion.suggested_per_hour && (
            <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium">Per-hour limit:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Current: {suggestion.current_per_hour}
                </span>
                <span className="text-sm font-semibold text-blue-600">
                  → Suggested: {suggestion.suggested_per_hour}
                </span>
              </div>
            </div>
          )}

          {suggestion.suggested_per_day && (
            <div className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium">Per-day limit:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Current: {suggestion.current_per_day}
                </span>
                <span className="text-sm font-semibold text-blue-600">
                  → Suggested: {suggestion.suggested_per_day}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mb-4">
        <p className="text-xs text-muted-foreground">
          💡 {suggestion.recommendation_reason}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => applyMutation.mutate()}
          disabled={applyMutation.isPending}
          className="flex-1"
        >
          {applyMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Apply Suggested Limits
            </>
          )}
        </Button>
        <Button variant="outline" asChild>
          <a href={`/dashboard/apis/${apiId}/rate-limit/observations`}>
            View Details
          </a>
        </Button>
      </div>
    </Card>
  );
}

export default function APIDetailPage() {
  const params = useParams();
  const router = useRouter();
  const apiId = params.id as string;

  const { data: api, isLoading } = useAPIConfig(apiId);
  const updateMutation = useUpdateAPI();
  const deleteMutation = useDeleteAPI();

  // Handlers
  const handleToggle = async (enabled: boolean) => {
    try {
      await updateMutation.mutateAsync({ id: apiId, data: { enabled } });
      toast.success(`API ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      toast.error(`Failed to ${enabled ? 'enable' : 'disable'} API`);
      throw error;
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(apiId);
      toast.success('API deleted successfully');
      router.push('/dashboard/apis');
    } catch (error) {
      toast.error('Failed to delete API');
      throw error;
    }
  };

  const handleDisable = async () => {
    await handleToggle(false);
  };

  const handleExport = async () => {
    try {
      // Implement export logic - for now just download API config as JSON
      const dataStr = JSON.stringify(api, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${api?.name}-export-${new Date().toISOString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('API data exported successfully');
    } catch (error) {
      toast.error('Failed to export API data');
      throw error;
    }
  };

  // Fetch dashboard stats for usage percentages
  const { data: dashboardStats } = useDashboardStats();
  
  // Subscribe to real-time WebSocket updates for this API
  const { liveMetrics, lastUpdate, isLive } = useAPIMetricsWebSocket(apiId);
  
  // Fetch usage history for chart
  const { data: usageResponse } = useQuery({
    queryKey: ["usage-history", apiId],
    queryFn: () => apiClient.getUsageHistory("30d"), // Get 30 days of data
  });

  // Transform usage data for chart
  const usageData = React.useMemo(() => {
    if (!usageResponse?.data) return [];
    
    return usageResponse.data.map((point: any, index: number) => {
      const timestamp = new Date(point.timestamp).getTime();
      
      return {
        timestamp,
        date: new Date(point.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        requests: Number(point.requests) || 0,
        // Add unique id for recharts key
        id: `${timestamp}-${index}`,
      };
    }).sort((a: any, b: any) => a.timestamp - b.timestamp);
  }, [usageResponse]);

  if (isLoading) {
    return <SkeletonAPIDetail />;
  }

  if (!api) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <p className="text-muted-foreground">API not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/apis">APIs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{api.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{api.name}</h1>
            {api.custom_headers?.description && (
              <p className="text-muted-foreground mt-1">
                {api.custom_headers.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={api.enabled ? "default" : "secondary"}>
            {api.enabled ? "Enabled" : "Disabled"}
          </Badge>
          {isLive && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Live {lastUpdate && `• ${lastUpdate.toLocaleTimeString()}`}
              </span>
            </div>
          )}
          <Button onClick={() => router.push(`/dashboard/apis/${apiId}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Usage History Chart */}
      <APIUsageChart data={usageData} loading={!usageResponse} isLive={true} />

      {/* Usage Progress Bars */}
      {dashboardStats && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Usage Overview</h3>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Daily Usage */}
            <UsageProgressBar
              label="Daily Requests"
              current={dashboardStats.stats.requests_today}
              limit={api.rate_limit_per_day}
              percentage={dashboardStats.stats.usage_percentages.daily_pct}
              resetTime={new Date(new Date().setHours(23, 59, 59, 999))}
            />
            {/* Monthly Usage */}
            <UsageProgressBar
              label="Monthly Requests"
              current={dashboardStats.stats.monthly_usage}
              limit={dashboardStats.stats.plan_limit}
              percentage={dashboardStats.stats.usage_percentages.monthly_pct}
              resetTime={
                new Date(
                  new Date().getFullYear(),
                  new Date().getMonth() + 1,
                  0,
                  23,
                  59,
                  59,
                  999
                )
              }
            />
          </div>
        </Card>
      )}

      {/* Rate Limit Suggestions */}
      <RateLimitSuggestions apiId={apiId} />

      {/* Proxy URL Card */}
      <ProxyURLCard 
        proxyUrl={api.proxy_url || `https://api.rateguard.io/proxy/${apiId}`}
        targetUrl={api.target_url}
        apiName={api.name}
      />

      {/* Live Analytics Dashboard */}
      <LiveAnalyticsDashboard
        apiId={apiId}
        metrics={liveMetrics ? {
          requests: liveMetrics.metrics.requests_today,
          successRate: liveMetrics.metrics.success_rate,
          avgLatency: liveMetrics.metrics.avg_latency_ms,
          totalCost: 0, // Not yet available in WebSocket stream
          errors: liveMetrics.metrics.error_count
        } : undefined}
        isLive={isLive}
        lastUpdate={lastUpdate || undefined}
      />

      {/* Recent Requests Stream */}
      <RecentRequestsStream
        apiId={apiId}
        isLive={isLive}
      />

      {/* API Keys Management */}
      <APIKeysManagement
        apiId={apiId}
      />

      {/* Management Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Settings */}
        <QuickSettingsPanel 
          api={api}
          onToggle={handleToggle}
        />

        {/* Danger Zone */}
        <DangerZone
          api={api}
          onDisable={handleDisable}
          onDelete={handleDelete}
          onExport={handleExport}
        />
      </div>
    </div>
  );
}
