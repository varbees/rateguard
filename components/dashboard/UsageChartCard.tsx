/**
 * UsageChartCard Component with WebSocket Streaming
 * 
 * Real-time usage chart that streams data points via WebSocket (Pro+)
 * or polls via HTTP (Free plan) with automatic fallback.
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line } from 'recharts';
import { format} from 'date-fns';
import useSWR from 'swr';
import { useUsageWebSocket } from '@/lib/websocket/use-websocket';
import { useUser } from "@/lib/hooks/use-user";
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { DisconnectionBanner } from './DisconnectionBanner';

interface UsageDataPoint {
  timestamp: string;
  requests: number;
  tokens?: number;
  cost: number;
  errors: number;
}

interface UsageChartCardProps {
  apiId?: string;
  loading?: boolean;
}

export function UsageChartCard({ apiId, loading = false }: UsageChartCardProps) {
  const { user } = useUser();
  const [data, setData] = useState<UsageDataPoint[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // WebSocket for real-time updates (Pro+)
  const { status, subscribe, isConnected, hasAccess, reconnect } = useUsageWebSocket(
    apiId || 'all'
  );

  // HTTP fallback for Free plan or WebSocket failure
  const shouldPoll = !hasAccess || status === 'error';
  const { data: fallbackData, error } = useSWR(
    shouldPoll ? `/api/v1/dashboard/usage/timeline?days=${timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30}` : null,
    { refreshInterval: hasAccess ? 60000 : 30000 } // 60s for Pro (fallback), 30s for Free
  );

  // Subscribe to WebSocket usage updates
  useEffect(() => {
    if (!isConnected) return;

    return subscribe('usage_datapoint', (newPoint: UsageDataPoint) => {
      setData(prev => {
        // Aggregate by minute for display
        const lastPoint = prev[prev.length - 1];
        const newTimestamp = new Date(newPoint.timestamp);
        const lastTimestamp = lastPoint ? new Date(lastPoint.timestamp) : null;

        // If same minute, aggregate
        if (lastTimestamp && newTimestamp.getMinutes() === lastTimestamp.getMinutes()) {
          return [
            ...prev.slice(0, -1),
            {
              ...lastPoint,
              requests: lastPoint.requests + newPoint.requests,
              tokens: (lastPoint.tokens || 0) + (newPoint.tokens || 0),
              cost: lastPoint.cost + newPoint.cost,
              errors: lastPoint.errors + newPoint.errors,
            },
          ];
        }

        // New minute, add new point (keep last 1000)
        return [...prev.slice(-999), newPoint];
      });
      setLastUpdate(new Date());
    });
  }, [isConnected, subscribe]);

  // Load fallback data
  useEffect(() => {
    if (fallbackData?.data) {
      setData(fallbackData.data);
      setLastUpdate(new Date());
    }
  }, [fallbackData]);

  // Transform data for chart
  const chartData = data.map(point => ({
    date: format(new Date(point.timestamp), 'MMM dd, HH:mm'),
    requests: point.requests,
    errors: point.errors,
  }));

  const totalRequests = data.reduce((sum, point) => sum + point.requests, 0);
  const totalCost = data.reduce((sum, point) => sum + point.cost, 0);

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div>
              <CardTitle>Request Volume</CardTitle>
              <CardDescription>
                {totalRequests.toLocaleString()} total requests
                {user?.plan !== 'free' && totalCost > 0 && (
                  <> • ${totalCost.toFixed(2)} estimated cost</>
                )}
              </CardDescription>
            </div>
            {hasAccess && (
              <ConnectionStatusIndicator status={status} showLabel={false} />
            )}
          </div>
          
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">
                Last 30 days
                {user?.plan === 'free' && ' (Pro)'}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {/* Disconnection banner */}
        {status === 'disconnected' && hasAccess && (
          <DisconnectionBanner 
            lastUpdate={lastUpdate}
            onRetry={reconnect}
            isRetrying={(status as string) === 'connecting' || (status as string) === 'reconnecting'}
          />
        )}

        {/* Chart or loading/empty state */}
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Failed to Load Data</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {error.message || 'An error occurred while loading usage data'}
            </p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Usage Data Yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Start making API requests to see usage analytics here
            </p>
          </div>
        ) : (
          <div role="img" aria-label={`Usage chart showing ${totalRequests} requests over the selected period`}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="requestsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#requestsGradient)"
                  strokeWidth={2}
                />
                {/* Error line overlay */}
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Screen reader data table */}
            <table className="sr-only">
              <caption>Usage data over time</caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Requests</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((point, i) => (
                  <tr key={i}>
                    <td>{point.date}</td>
                    <td>{point.requests}</td>
                    <td>{point.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Free plan polling notice */}
        {!hasAccess && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            ⏱️ Updates every 30 seconds • Upgrade to Pro for live data
          </p>
        )}
      </CardContent>
    </Card>
  );
}
