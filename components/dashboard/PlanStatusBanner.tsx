/**
 * PlanStatusBanner Component with WebSocket Alerts
 * 
 * Displays critical alerts from WebSocket stream (usage warnings, payment failures, etc)
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, XCircle, Clock, X } from 'lucide-react';
import { useAlertsWebSocket } from '@/lib/websocket/use-websocket';
import { useUser } from '@/lib/hooks/use-user';

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
  const { user } = useUser();
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const { subscribe, isConnected } = useAlertsWebSocket();

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

  // Check usage warnings (client-side calculation)
  useEffect(() => {
    if (!user) return;

    const apiUsagePercent = (user.currentUsage?.apiCount / user.planLimits?.maxApis) * 100;
    const requestsPercent = (user.currentUsage?.requestsThisMonth / user.planLimits?.requestsPerMonth) * 100;

    if (apiUsagePercent >= 80) {
      setAlerts(prev => {
        if (prev.some(a => a.title === 'API Limit Warning')) return prev;
        
        return [{
          id: 'usage_warning',
          severity: apiUsagePercent >= 95 ? 'error' : 'warning',
          title: 'API Limit Warning',
          message: `You're using ${apiUsagePercent.toFixed(0)}% of your API limit (${user.currentUsage.apiCount}/${user.planLimits.maxApis})`,
          action: {
            label: 'Upgrade Plan',
            href: '/dashboard/billing',
          },
          dismissible: true,
        }, ...prev];
      });
    }

    if (requestsPercent >= 80) {
      setAlerts(prev => {
        if (prev.some(a => a.title === 'Request Limit Warning')) return prev;
        
        return [{
          id: 'requests_warning',
          severity: requestsPercent >= 95 ? 'error' : 'warning',
          title: 'Request Limit Warning',
          message: `You're using ${requestsPercent.toFixed(0)}% of your monthly request limit`,
          action: {
            label: 'View Usage',
            href: '/dashboard/usage',
          },
          dismissible: true,
        }, ...prev];
      });
    }
  }, [user]);

  // Check payment status
  useEffect(() => {
    if (!user || user.billingStatus !== 'past_due') return;

    setAlerts(prev => {
      if (prev.some(a => a.title === 'Payment Failed')) return prev;
      
      return [{
        id: 'payment_failed',
        severity: 'error',
        title: 'Payment Failed',
        message: 'Update your payment method to avoid service interruption',
        action: {
          label: 'Update Payment',
          href: '/dashboard/billing',
        },
        dismissible: false, // Critical, can't dismiss
      }, ...prev];
    });
  }, [user?.billingStatus]);

  // Trial ending warning
  useEffect(() => {
    if (!user?.trialEndsAt) return;

    const daysLeft = Math.ceil(
      (new Date(user.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft <= 3 && daysLeft > 0) {
      setAlerts(prev => {
        if (prev.some(a => a.title === 'Trial Ending Soon')) return prev;
        
        return [{
          id: 'trial_ending',
          severity: 'info',
          title: 'Trial Ending Soon',
          message: `Your trial ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Choose a plan to continue.`,
          action: {
            label: 'View Plans',
            href: '/dashboard/billing',
          },
          dismissible: true,
        }, ...prev];
      });
    }
  }, [user?.trialEndsAt]);

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    
    // Store dismissal in localStorage
    localStorage.setItem(`alert_dismissed_${id}`, new Date().toISOString());
  };

  // Show most critical alert first
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const alertToShow = sortedAlerts[0];

  if (!alertToShow) return null;

  const getIcon = () => {
    switch (alertToShow.severity) {
      case 'error':
        return XCircle;
      case 'warning':
        return AlertTriangle;
      case 'info':
        return Clock;
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
