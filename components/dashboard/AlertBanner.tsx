"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardAPI, Alert } from "@/lib/api";
import { useState } from "react";
import { X, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket/context";
import { toast } from "sonner";
import { useEffect } from "react";

export function AlertBanner() {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(
    new Set()
  );
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-alerts"],
    queryFn: dashboardAPI.alerts,
    // No polling needed - WebSocket provides real-time updates
    refetchOnWindowFocus: true, // Still refetch when window regains focus
  });

  // Subscribe to real-time alerts
  useEffect(() => {
    const unsubscribe = subscribe("alert.triggered", (event) => {
      // Invalidate queries to fetch fresh data
      queryClient.invalidateQueries({ queryKey: ["dashboard-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });

      const alert = event.data as any;

      // Show toast notification
      if (alert.type === "critical") {
        toast.error(alert.title, {
          description: alert.message,
          duration: 10000,
        });
      } else if (alert.type === "warning") {
        toast.warning(alert.title, {
          description: alert.message,
          duration: 8000,
        });
      } else {
        toast.info(alert.title, {
          description: alert.message,
          duration: 5000,
        });
      }
    });

    return unsubscribe;
  }, [subscribe, queryClient]);

  if (isLoading || !data || data.count === 0) {
    return null;
  }

  // Filter out dismissed alerts
  const activeAlerts = data.alerts.filter(
    (alert) => !dismissedAlerts.has(alert.id)
  );

  if (activeAlerts.length === 0) {
    return null;
  }

  const handleDismiss = (alertId: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(alertId));
  };

  return (
    <div className="space-y-3 mb-6">
      {activeAlerts.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onDismiss={() => handleDismiss(alert.id)}
        />
      ))}
    </div>
  );
}

interface AlertCardProps {
  alert: Alert;
  onDismiss: () => void;
}

function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const { icon, bgColor, borderColor, textColor, iconColor } = getAlertStyles(
    alert.type
  );

  return (
    <div
      className={`${bgColor} ${borderColor} border-l-4 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2 duration-300`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`${iconColor} flex-shrink-0 mt-0.5`}>{icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className={`font-semibold ${textColor}`}>{alert.title}</h3>
              <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
              {alert.api_name && (
                <p className="text-xs text-gray-500 mt-1">
                  API: <span className="font-medium">{alert.api_name}</span>
                </p>
              )}
            </div>

            {/* Dismiss Button */}
            {alert.dismissible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="flex-shrink-0 h-6 w-6 p-0 hover:bg-gray-200/50"
              >
                <X className="h-4 w-4 text-gray-500" />
              </Button>
            )}
          </div>

          {/* Metric display (if available) */}
          {alert.metric_value !== undefined && alert.metric && (
            <div className="mt-2 text-xs text-gray-600">
              {alert.metric}:{" "}
              <span className="font-mono font-semibold">
                {formatMetricValue(alert.metric, alert.metric_value)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getAlertStyles(type: Alert["type"]) {
  switch (type) {
    case "critical":
      return {
        icon: <AlertTriangle className="w-5 h-5" />,
        bgColor: "bg-red-50",
        borderColor: "border-red-500",
        textColor: "text-red-900",
        iconColor: "text-red-600",
      };
    case "warning":
      return {
        icon: <AlertCircle className="w-5 h-5" />,
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-500",
        textColor: "text-yellow-900",
        iconColor: "text-yellow-600",
      };
    case "info":
      return {
        icon: <Info className="w-5 h-5" />,
        bgColor: "bg-blue-50",
        borderColor: "border-blue-500",
        textColor: "text-blue-900",
        iconColor: "text-blue-600",
      };
  }
}

function formatMetricValue(metric: string, value: number): string {
  if (metric === "429_rate" || metric === "usage_percent") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(2);
}
