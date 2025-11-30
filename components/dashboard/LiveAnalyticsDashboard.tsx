'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Clock, DollarSign, AlertCircle, WifiOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface LiveAnalyticsDashboardProps {
  apiId: string;
  metrics?: {
    requests: number;
    successRate: number;
    avgLatency: number;
    totalCost: number;
    errors: number;
  };
  chartData?: Array<{ time: string; requests: number; errors: number; latency: number }>;
  isLive?: boolean;
  lastUpdate?: Date;
}

export function LiveAnalyticsDashboard({
  apiId,
  metrics,
  chartData = [],
  isLive = false,
  lastUpdate,
}: LiveAnalyticsDashboardProps) {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d' | '30d'>('24h');
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('area');

  // Mock data if none provided
  const displayMetrics = metrics || {
    requests: 15234,
    successRate: 98.5,
    avgLatency: 245,
    totalCost: 12.45,
    errors: 128,
  };

  const displayChartData = chartData.length > 0 ? chartData : [
    { time: '00:00', requests: 120, errors: 2, latency: 235 },
    { time: '04:00', requests: 89, errors: 1, latency: 198 },
    { time: '08:00', requests: 245, errors: 5, latency: 267 },
    { time: '12:00', requests: 389, errors: 8, latency: 312 },
    { time: '16:00', requests: 456, errors: 12, latency: 289 },
    { time: '20:00', requests: 234, errors: 4, latency: 245 },
  ];

  const metricCards = [
    {
      title: 'Total Requests',
      value: displayMetrics.requests.toLocaleString(),
      icon: Activity,
      trend: '+12.5%',
      trendUp: true,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Success Rate',
      value: `${displayMetrics.successRate}%`,
      icon: TrendingUp,
      trend: '+2.1%',
      trendUp: true,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'Avg Latency',
      value: `${displayMetrics.avgLatency}ms`,
      icon: Clock,
      trend: '-5.3%',
      trendUp: true,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      title: 'Total Cost',
      value: `$${displayMetrics.totalCost}`,
      icon: DollarSign,
      trend: '+$2.15',
      trendUp: false,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    },
  ];

  const renderChart = () => {
    const commonProps = {
      data: displayChartData,
      margin: { top: 10, right: 10, left: 0, bottom: 0 },
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="time" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="requests"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="errors"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="time" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Area
              type="monotone"
              dataKey="requests"
              stroke="hsl(var(--primary))"
              fillOpacity={1}
              fill="url(#colorRequests)"
            />
          </AreaChart>
        );
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="time" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Bar dataKey="requests" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold">Live Analytics</h3>
          {isLive ? (
            <Badge variant="outline" className="gap-1 border-green-500/50 bg-green-500/10">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <WifiOff className="w-3 h-3" />
              Offline
            </Badge>
          )}
        </div>
        {lastUpdate && (
          <span className="text-xs text-muted-foreground">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((metric, i) => (
          <Card key={i} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <div className={cn('p-2 rounded-lg', metric.bgColor)}>
                <metric.icon className={cn('h-4 w-4', metric.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <div className="flex items-center gap-1 text-xs mt-1">
                {metric.trendUp ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
                <span className={metric.trendUp ? 'text-green-600' : 'text-red-600'}>
                  {metric.trend}
                </span>
                <span className="text-muted-foreground">from last period</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Request Analytics</CardTitle>
              <CardDescription>Real-time request and error tracking</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Time Range Selector */}
              <div className="flex rounded-lg border">
                {(['1h', '6h', '24h', '7d', '30d'] as const).map((range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimeRange(range)}
                    className="rounded-none first:rounded-l-lg last:rounded-r-lg"
                  >
                    {range}
                  </Button>
                ))}
              </div>
              
              {/* Chart Type Selector */}
              <div className="flex rounded-lg border">
                {(['area', 'line', 'bar'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={chartType === type ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setChartType(type)}
                    className="rounded-none first:rounded-l-lg last:rounded-r-lg capitalize"
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Error Breakdown */}
      {displayMetrics.errors > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Error Breakdown</CardTitle>
            </div>
            <CardDescription>
              {displayMetrics.errors} errors in the last {timeRange}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">429</Badge>
                  <span className="text-sm">Rate Limit Exceeded</span>
                </div>
                <span className="text-sm font-semibold">78</span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">500</Badge>
                  <span className="text-sm">Internal Server Error</span>
                </div>
                <span className="text-sm font-semibold">32</span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">401</Badge>
                  <span className="text-sm">Unauthorized</span>
                </div>
                <span className="text-sm font-semibold">18</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
