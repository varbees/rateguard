"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RequestLog {
  id: string;
  api_name: string;
  method: string;
  path: string;
  status_code: number;
  response_time_ms: number;
  timestamp: string;
  error_message?: string;
}

interface RecentActivityProps {
  requests: RequestLog[];
  loading?: boolean;
  onRefresh?: () => void;
  onViewDetails?: (request: RequestLog) => void;
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyActivityState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Activity className="size-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold mb-2">No Recent Activity</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        API requests will appear here as they come in. Start making requests to
        see them tracked in real-time.
      </p>
    </div>
  );
}

function getStatusInfo(statusCode: number) {
  if (statusCode >= 200 && statusCode < 300) {
    return {
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950",
      variant: "default" as const,
      label: "Success",
      badgeClass: "bg-green-600 hover:bg-green-700",
    };
  }
  if (statusCode === 429) {
    return {
      icon: AlertCircle,
      color: "text-yellow-600",
      bg: "bg-yellow-50 dark:bg-yellow-950",
      variant: "secondary" as const,
      label: "Rate Limited",
      badgeClass: "bg-yellow-600 hover:bg-yellow-700 text-white",
    };
  }
  if (statusCode >= 400) {
    return {
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950",
      variant: "destructive" as const,
      label: "Error",
      badgeClass: "bg-red-600 hover:bg-red-700",
    };
  }
  return {
    icon: Activity,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950",
    variant: "secondary" as const,
    label: "Info",
    badgeClass: "bg-blue-600 hover:bg-blue-700 text-white",
  };
}

export function RecentActivity({
  requests,
  loading = false,
  onRefresh,
  onViewDetails,
}: RecentActivityProps) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (loading) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Last 10 API requests across all endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivitySkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              Recent Activity
            </CardTitle>
            <CardDescription className="mt-1.5">
              Live feed of your latest API requests and responses
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2 w-full sm:w-auto"
          >
            <RefreshCw
              className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <EmptyActivityState />
        ) : (
          <div className="space-y-3">
            {requests.slice(0, 10).map((request) => {
              const statusInfo = getStatusInfo(request.status_code);
              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={request.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => onViewDetails?.(request)}
                >
                  {/* Status Icon */}
                  <div className={`p-2 rounded-full ${statusInfo.bg} shrink-0`}>
                    <StatusIcon className={`size-5 ${statusInfo.color}`} />
                  </div>

                  {/* Request Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm truncate">
                        {request.api_name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-xs font-mono shrink-0"
                      >
                        {request.method}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mb-1">
                      {request.path}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatDistanceToNow(new Date(request.timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                      <span className="hidden sm:inline">
                        {request.response_time_ms}ms
                      </span>
                    </div>
                    {request.error_message && (
                      <p className="text-xs text-destructive mt-1 truncate">
                        {request.error_message}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <Badge className={`${statusInfo.badgeClass} shrink-0`}>
                    {request.status_code}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
