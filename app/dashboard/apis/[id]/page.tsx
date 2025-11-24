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
  Edit,
  TrendingUp,
  Clock,
  Shield,
  Settings,
  Loader2,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { UsageProgressBar } from "@/components/dashboard/UsageProgressBar";

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
      queryClient.invalidateQueries({ queryKey: ["api", apiId] });
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

  const { data: api, isLoading } = useQuery({
    queryKey: ["api", apiId],
    queryFn: () => apiClient.getAPIConfig(apiId),
  });

  // Fetch dashboard stats for usage percentages
  const { data: dashboardStats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiClient.getDashboardStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
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
          <Button onClick={() => router.push(`/dashboard/apis/${apiId}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

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
              current={dashboardStats.requests_today}
              limit={api.rate_limit_per_day}
              percentage={dashboardStats.usage_percentages.daily_pct}
              resetTime={new Date(new Date().setHours(23, 59, 59, 999))}
            />
            {/* Monthly Usage */}
            <UsageProgressBar
              label="Monthly Requests"
              current={dashboardStats.monthly_usage}
              limit={dashboardStats.plan_limit}
              percentage={dashboardStats.usage_percentages.monthly_pct}
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

      {/* API Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic Info */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Basic Information</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Target URL</p>
              <p className="text-sm font-mono">{api.target_url}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API ID</p>
              <p className="text-sm font-mono">{api.id}</p>
            </div>
          </div>
        </Card>

        {/* Rate Limits */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Current Rate Limits</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Per Second:</span>
              <span className="text-sm font-medium">
                {api.rate_limit_per_second}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Per Hour:</span>
              <span className="text-sm font-medium">
                {api.rate_limit_per_hour || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Per Day:</span>
              <span className="text-sm font-medium">
                {api.rate_limit_per_day || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Burst Size:</span>
              <span className="text-sm font-medium">{api.burst_size}</span>
            </div>
          </div>
        </Card>

        {/* Advanced Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Advanced Settings</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Timeout:</span>
              <span className="text-sm font-medium">
                {api.timeout_seconds}s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Retry Attempts:
              </span>
              <span className="text-sm font-medium">{api.retry_attempts}</span>
            </div>
          </div>
        </Card>

        {/* CORS */}
        {api.allowed_origins && api.allowed_origins.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">CORS Origins</h3>
            <div className="space-y-1">
              {api.allowed_origins.map((origin, i) => (
                <p key={i} className="text-sm font-mono">
                  {origin}
                </p>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
