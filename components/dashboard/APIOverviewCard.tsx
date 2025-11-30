/**
 * APIOverviewCard Component
 * 
 * Shows key metrics with real-time WebSocket updates
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, TrendingDown, Zap, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { useAPIMetricsWebSocket } from '@/lib/websocket/use-api-websocket';
import { useUser } from '@/lib/hooks/use-user';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    percentage: number;
  };
  isUpdating?: boolean;
  planGated?: boolean;
}

function MetricCard({ icon: Icon, label, value, subtitle, trend, isUpdating, planGated }: MetricCardProps) {
  return (
    <div className={cn(
      "p-4 rounded-lg border bg-card transition-all duration-300",
      isUpdating && "ring-2 ring-primary/20"
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trend.direction === 'up' && "text-green-600",
            trend.direction === 'down' && "text-red-600",
            trend.direction === 'neutral' && "text-muted-foreground"
          )}>
            {trend.direction === 'up' ? (
              <TrendingUp className="h-3 w-3" />
            ) : trend.direction === 'down' ? (
              <TrendingDown className="h-3 w-3" />
            ) : null}
            {trend.percentage.toFixed(1)}%
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {planGated ? (
          <p className="text-2xl font-bold blur-sm select-none">$99.99</p>
        ) : (
          <p className={cn(
            "text-2xl font-bold transition-all",
            isUpdating && "scale-105"
          )}>
            {value}
          </p>
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

interface APIMetrics {
  requestsToday: number;
  requestsThisHour: number;
  successRate: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  tokensConsumed?: number;
  estimatedCost?: number;
}

interface APIOverviewCardProps {
  apiId: string;
  loading?: boolean;
}

export function APIOverviewCard({ apiId, loading = false }: APIOverviewCardProps) {
  const { hasAccess } = useUser();
  const [metrics, setMetrics] = useState<APIMetrics | null>(null);
  const [ previousMetrics, setPreviousMetrics] = useState<APIMetrics | null>(null);
  const [updatingMetric, setUpdatingMetric] = useState<string | null>(null);

  const { status, subscribe, isConnected } = useAPIMetricsWebSocket(apiId);

  useEffect(() => {
    if (!isConnected) return;

    return subscribe('overview_update', (data: APIMetrics) => {
      // Store previous for trend calculation
      if (metrics) {
        setPreviousMetrics(metrics);
      }
      
      // Show update animation
      setUpdatingMetric('all');
      setMetrics(data);
      
      setTimeout(() => setUpdatingMetric(null), 500);
    });
  }, [isConnected, subscribe, metrics]);

  const calculateTrend = (current: number, previous?: number) => {
    if (!previous) return undefined;
    const change = ((current - previous) / previous) * 100;
    return {
      direction: change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'neutral' as const,
      percentage: Math.abs(change),
    };
  };

  const canSeeCost = hasAccess('pro');

  if (loading || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>API Overview</CardTitle>
          <ConnectionStatusIndicator status={status} showLabel={false} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Zap}
            label="Requests Today"
            value={metrics.requestsToday.toLocaleString()}
            subtitle={`${metrics.requestsThisHour.toLocaleString()} this hour`}
            trend={calculateTrend(metrics.requestsToday, previousMetrics?.requestsToday)}
            isUpdating={updatingMetric === 'all'}
          />
          
          <MetricCard
            icon={CheckCircle2}
            label="Success Rate"
            value={`${metrics.successRate.toFixed(1)}%`}
            trend={calculateTrend(metrics.successRate, previousMetrics?.successRate)}
            isUpdating={updatingMetric === 'all'}
          />
          
          <MetricCard
            icon={Clock}
            label="Avg Latency"
            value={`${metrics.avgLatency}ms`}
            subtitle={`P95: ${metrics.p95Latency}ms, P99: ${metrics.p99Latency}ms`}
            trend={calculateTrend(metrics.avgLatency, previousMetrics?.avgLatency)}
            isUpdating={updatingMetric === 'all'}
          />

          {metrics.tokensConsumed !== undefined && (
            <MetricCard
              icon={Activity}
              label="Tokens Used"
              value={metrics.tokensConsumed.toLocaleString()}
              isUpdating={updatingMetric === 'all'}
            />
          )}

          {metrics.estimatedCost !== undefined && (
            <MetricCard
              icon={DollarSign}
              label="Estimated Cost"
              value={`$${metrics.estimatedCost.toFixed(2)}`}
              planGated={!canSeeCost}
              isUpdating={updatingMetric === 'all'}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
