/**
 * RateLimitObservationCard Component
 * 
 * Real-time rate limit monitoring with visual progress bars
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Activity } from 'lucide-react';
import { useAPIRateLimitsWebSocket } from '@/lib/websocket/use-api-websocket';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { cn } from '@/lib/utils';

interface RateLimitTier {
  used: number;
  limit: number;
  percentage: number;
}

interface RateLimitData {
  perSecond?: RateLimitTier;
  perHour?: RateLimitTier;
  perDay?: RateLimitTier;
  perMonth?: RateLimitTier;
  recentThrottles: number;
  burstUsed: number;
  burstLimit: number;
}

interface RateLimitObservationCardProps {
  apiId: string;
  loading?: boolean;
}

function RateLimitRow({
  label,
  tier,
  warn = 80,
  critical = 95,
}: {
  label: string;
  tier?: RateLimitTier;
  warn?: number;
  critical?: number;
}) {
  if (!tier) return null;

  const getColor = () => {
    if (tier.percentage >= critical) return 'bg-red-500';
    if (tier.percentage >= warn) return 'bg-yellow-500';
    return 'bg-primary';
  };

  const getTextColor = () => {
    if (tier.percentage >= critical) return 'text-red-600';
    if (tier.percentage >= warn) return 'text-yellow-600';
    return 'text-foreground';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", getTextColor())}>
          {tier.percentage.toFixed(0)}% ({tier.used.toLocaleString()}/{tier.limit.toLocaleString()})
        </span>
      </div>
      <div className="relative">
        <Progress 
          value={tier.percentage} 
          className={cn("h-2", getColor())}
        />
      </div>
    </div>
  );
}

export function RateLimitObservationCard({ apiId, loading = false }: RateLimitObservationCardProps) {
  const [rateLimits, setRateLimits] = useState<RateLimitData | null>(null);
  const { status, subscribe, isConnected } = useAPIRateLimitsWebSocket(apiId);

  useEffect(() => {
    if (!isConnected) return;

    return subscribe('rate_limit_observation', (data: RateLimitData) => {
      setRateLimits(data);
    });
  }, [isConnected, subscribe]);

  if (loading || !rateLimits) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rate Limit Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine highest usage tier
  const highestUsage = Math.max(
    rateLimits.perSecond?.percentage || 0,
    rateLimits.perHour?.percentage || 0,
    rateLimits.perDay?.percentage || 0,
    rateLimits.perMonth?.percentage || 0
  );

  const showWarning = highestUsage >= 80;
  const showCritical = highestUsage >= 95;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Rate Limit Status
              {showCritical && (
                <span className="text-xs font-normal text-red-600">
                  <AlertTriangle className="inline h-3 w-3 mr-1" />
                  Critical
                </span>
              )}
              {showWarning && !showCritical && (
                <span className="text-xs font-normal text-yellow-600">
                  <AlertTriangle className="inline h-3 w-3 mr-1" />
                  Warning
                </span>
              )}
            </CardTitle>
          </div>
          <ConnectionStatusIndicator status={status} showLabel={false} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alert for high usage */}
        {showWarning && (
          <Alert variant={showCritical ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {showCritical 
                ? `Critical: You're using ${highestUsage.toFixed(0)}% of your rate limit. Requests may be throttled.`
                : `Warning: You're using ${highestUsage.toFixed(0)}% of your rate limit.`
              }
            </AlertDescription>
          </Alert>
        )}

        {/* Rate limit bars */}
        <div className="space-y-4">
          <RateLimitRow label="Per Second" tier={rateLimits.perSecond} />
          <RateLimitRow label="Per Hour" tier={rateLimits.perHour} />
          <RateLimitRow label="Per Day" tier={rateLimits.perDay} />
          <RateLimitRow label="Per Month" tier={rateLimits.perMonth} />
        </div>

        {/* Additional info */}
        <div className="pt-4 border-t grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Recent Throttles (1h)</p>
            <p className={cn(
              "text-lg font-semibold",
              rateLimits.recentThrottles > 0 ? "text-red-600" : "text-green-600"
            )}>
              {rateLimits.recentThrottles}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Burst Available</p>
            <p className="text-lg font-semibold">
              {rateLimits.burstLimit - rateLimits.burstUsed}/{rateLimits.burstLimit}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
