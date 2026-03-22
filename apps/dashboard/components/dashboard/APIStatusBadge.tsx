/**
 * APIStatusBadge Component
 * 
 * Shows real-time status of an API with visual indicators
 */

'use client';

import { cn } from '@/lib/utils';
import { Activity, AlertCircle, CheckCircle2, Pause, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type APIHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

interface APIStatusBadgeProps {
  enabled: boolean;
  healthStatus?: APIHealthStatus;
  circuitBreakerState?: CircuitBreakerState;
  isLive?: boolean;
  className?: string;
  showIcon?: boolean;
  showText?: boolean;
}

export function APIStatusBadge({
  enabled,
  healthStatus = 'unknown',
  circuitBreakerState = 'closed',
  isLive = false,
  className,
  showIcon = true,
  showText = true,
}: APIStatusBadgeProps) {
  // Determine overall status
  const getStatus = () => {
    if (!enabled) {
      return {
        label: 'Paused',
        variant: 'secondary' as const,
        icon: Pause,
        color: 'text-gray-500',
        dotColor: 'bg-gray-500',
      };
    }

    if (circuitBreakerState === 'open') {
      return {
        label: 'Circuit Open',
        variant: 'destructive' as const,
        icon: AlertCircle,
        color: 'text-red-600',
        dotColor: 'bg-red-500',
      };
    }

    if (circuitBreakerState === 'half_open') {
      return {
        label: 'Testing',
        variant: 'secondary' as const,
        icon: Activity,
        color: 'text-yellow-600',
        dotColor: 'bg-yellow-500',
      };
    }

    switch (healthStatus) {
      case 'healthy':
        return {
          label: 'Healthy',
          variant: 'default' as const,
          icon: CheckCircle2,
          color: 'text-green-600',
          dotColor: 'bg-green-500',
        };
      case 'degraded':
        return {
          label: 'Degraded',
          variant: 'secondary' as const,
          icon: AlertCircle,
          color: 'text-yellow-600',
          dotColor: 'bg-yellow-500',
        };
      case 'down':
        return {
          label: 'Down',
          variant: 'destructive' as const,
          icon: AlertCircle,
          color: 'text-red-600',
          dotColor: 'bg-red-500',
        };
      default:
        return {
          label: 'Unknown',
          variant: 'outline' as const,
          icon: Circle,
          color: 'text-gray-500',
          dotColor: 'bg-gray-500',
        };
    }
  };

  const status = getStatus();
  const Icon = status.icon;

  return (
    <Badge
      variant={status.variant}
      className={cn(
        'flex items-center gap-1.5',
        enabled && healthStatus === 'healthy' && 'bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20',
        enabled && healthStatus === 'degraded' && 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20',
        enabled && healthStatus === 'down' && 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20',
        !enabled && 'bg-gray-500/10 text-gray-600 border-gray-500/20',
        className
      )}
      role="status"
      aria-label={`API status: ${status.label}${isLive ? ', live updates active' : ''}`}
    >
      {showIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {showText && <span>{status.label}</span>}
      {isLive && (
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            status.dotColor,
            'animate-pulse'
          )}
          aria-hidden="true"
        />
      )}
    </Badge>
  );
}

/**
 * Lightweight status dot indicator
 */
export function APIStatusDot({
  enabled,
  healthStatus = 'unknown',
  isLive = false,
  className,
}: Pick<APIStatusBadgeProps, 'enabled' | 'healthStatus' | 'isLive' | 'className'>) {
  const getDotColor = () => {
    if (!enabled) return 'bg-gray-500';
    
    switch (healthStatus) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div
      className={cn(
        'w-2 h-2 rounded-full',
        getDotColor(),
        isLive && 'animate-pulse',
        className
      )}
      role="status"
      aria-label={`${enabled ? healthStatus : 'paused'} status${isLive ? ', live' : ''}`}
    />
  );
}
