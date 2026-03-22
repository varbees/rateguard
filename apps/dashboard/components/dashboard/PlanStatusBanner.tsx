'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';
import { useAlertsWebSocket } from '@/lib/websocket/use-websocket';
import { useDashboardStats } from '@/lib/hooks/use-api';

interface AlertData {
  id: string;
  severity: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
  dismissible: boolean;
}

export function PlanStatusBanner() {
  const { data: dashboardStats } = useDashboardStats();
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const { subscribe, isConnected } = useAlertsWebSocket();
  const stats = dashboardStats?.stats;
  const usagePercent =
    stats && stats.plan_limit > 0
      ? (stats.monthly_usage / stats.plan_limit) * 100
      : 0;

  // Subscribe to alert notifications
  useEffect(() => {
    if (!isConnected) return;

    return subscribe('alert', (alertData: Omit<AlertData, 'id'>) => {
      const newAlert: AlertData = {
        id: `alert_${Date.now()}`,
        ...alertData,
      };

      setAlerts(prev => {
        // Prevent duplicates
        if (prev.some(a => a.message === newAlert.message)) {
          return prev;
        }
        return [newAlert, ...prev];
      });
    });
  }, [isConnected, subscribe]);

  // Check usage warnings from the live dashboard stats
  useEffect(() => {
    if (!stats || usagePercent < 80) return;

    setAlerts(prev => {
      if (prev.some(a => a.title === 'Usage Guardrail Warning')) return prev;

      return [
        {
          id: 'usage_warning',
          severity: usagePercent >= 95 ? 'error' : 'warning',
          title: 'Usage Guardrail Warning',
          message: `You're using ${usagePercent.toFixed(0)}% of your monthly request budget (${formatNumber(stats.monthly_usage)}/${formatNumber(stats.plan_limit)})`,
          action: {
            label: 'Review Guardrails',
            href: '/dashboard/budget',
          },
          dismissible: true,
        },
        ...prev,
      ];
    });
  }, [stats, usagePercent]);

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));

    // Store dismissal in localStorage
    localStorage.setItem(`alert_dismissed_${id}`, new Date().toISOString());
  };

  // Show most critical alert first
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const alertToShow = sortedAlerts[0];

  if (!alertToShow) return null;

  const getIcon = () => {
    switch (alertToShow.severity) {
      case 'warning':
        return AlertTriangle;
      case 'info':
        return AlertTriangle;
      case 'error':
        return AlertTriangle;
    }
  };

  const Icon = getIcon();

  return (
    <Alert
      variant={alertToShow.severity === 'error' ? 'destructive' : 'default'}
      className="mb-6"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon className="h-4 w-4" />
      <div className="flex items-start justify-between gap-4 flex-1">
        <div className="flex-1">
          <AlertTitle id={`alert-title-${alertToShow.id}`}>
            {alertToShow.title}
          </AlertTitle>
          <AlertDescription>{alertToShow.message}</AlertDescription>
        </div>
        <div className="flex items-center gap-2">
          {alertToShow.action && (
            <Button
              variant="outline"
              size="sm"
              asChild
              aria-describedby={`alert-title-${alertToShow.id}`}
            >
              <Link href={alertToShow.action.href}>
                {alertToShow.action.label}
              </Link>
            </Button>
          )}
          {alertToShow.dismissible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismissAlert(alertToShow.id)}
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Alert>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}
