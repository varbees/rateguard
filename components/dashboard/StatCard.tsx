/**
 * StatCard Component with WebSocket Live Updates
 * 
 * Displays a metric card that updates in real-time via WebSocket (Pro+)
 * or via HTTP polling (Free plan).
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { useDashboardWebSocket } from '@/lib/websocket/use-websocket';
import { useUser } from '@/lib/hooks/use-user';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    percentage: number;
  };
  href?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  planGated?: 'pro' | 'enterprise';
  loading?: boolean;
  websocketField?: 'requestsToday' | 'apiCount' | 'estimatedCost' | 'successRate';
}

export function StatCard({
  title,
  value: initialValue,
  subtitle,
  icon: Icon,
  trend: initialTrend,
  href,
  variant = 'default',
  planGated,
  loading = false,
  websocketField,
}: StatCardProps) {
  const { user } = useUser();
  const [value, setValue] = useState(initialValue);
  const [trend, setTrend] = useState(initialTrend);
  const [isUpdating, setIsUpdating] = useState(false);

  // WebSocket connection for live updates
  const { status, subscribe, isConnected, hasAccess } = useDashboardWebSocket();

  // Check if user has access to this feature based on plan
  const isPlanGated = planGated && user?.plan !== planGated && user?.plan !== 'enterprise';

  // Subscribe to stats updates via WebSocket
  useEffect(() => {
    if (!isConnected || !websocketField) return;

    return subscribe('stats_update', (data: any) => {
      // Update the specific field this card is tracking
      if (data[websocketField] !== undefined) {
        // Show update animation
        setIsUpdating(true);
        setTimeout(() => setIsUpdating(false), 500);

        // Update value with smooth transition
        setValue(data[websocketField]);

        // Update trend if provided
        if (data[`${websocketField}Delta`] !== undefined) {
          const delta = data[`${websocketField}Delta`];
          setTrend({
            direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral',
            percentage: Math.abs(delta),
          });
        }
      }
    });
  }, [isConnected, subscribe, websocketField]);

  const content = (
    <Card
      className={cn(
        'hover:shadow-md transition-all duration-200',
        href && 'cursor-pointer',
        variant === 'success' && 'border-green-500/20',
        variant === 'warning' && 'border-yellow-500/20',
        variant === 'error' && 'border-red-500/20',
        isUpdating && 'ring-2 ring-primary/20'
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* WebSocket live indicator (Pro+ only) */}
          {websocketField && hasAccess && (
            <ConnectionStatusIndicator 
              status={status} 
              showLabel={false}
              className="mr-1"
            />
          )}
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-32" />
            {subtitle && <Skeleton className="h-3 w-20" />}
          </div>
        ) : isPlanGated ? (
          <div className="space-y-2">
            <div className="text-2xl font-bold blur-sm select-none">
              $99.99
            </div>
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              {planGated} plan required
            </Badge>
          </div>
        ) : (
          <>
            <div 
              className={cn(
                "text-2xl font-bold transition-all duration-300",
                isUpdating && "scale-105"
              )}
              aria-live="polite"
              aria-atomic="true"
            >
              {value}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">
                {subtitle}
              </p>
            )}
            {trend && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs mt-2',
                  trend.direction === 'up' && 'text-green-600',
                  trend.direction === 'down' && 'text-red-600',
                  trend.direction === 'neutral' && 'text-muted-foreground'
                )}
                role="status"
                aria-label={`${trend.direction === 'up' ? 'Up' : trend.direction === 'down' ? 'Down' : 'No change'} ${trend.percentage}% from yesterday`}
              >
                {trend.direction === 'up' ? (
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                ) : trend.direction === 'down' ? (
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Minus className="h-3 w-3" aria-hidden="true" />
                )}
                <span>{Math.abs(trend.percentage).toFixed(1)}% vs yesterday</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  if (href && !isPlanGated) {
    return (
      <Link 
        href={href}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
      >
        {content}
      </Link>
    );
  }

  return content;
}
