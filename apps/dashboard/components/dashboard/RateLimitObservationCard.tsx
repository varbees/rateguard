/**
 * RateLimitObservationCard Component
 *
 * Shows the most recent rate-limit observations from the backend HTTP API.
 * There is no realtime websocket event for this view, so this card stays on
 * the actual observations endpoint instead of inventing one.
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Activity, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRateLimitObservations } from '@/lib/hooks/use-api';

interface RateLimitObservation {
  id: string;
  source_header?: string;
  observed_at: string;
  response_status: number;
  limit_per_window?: number;
  window_seconds?: number;
}

interface RateLimitObservationCardProps {
  apiId: string;
  loading?: boolean;
}

function formatWindow(seconds?: number): string {
  if (!seconds) return 'unknown window';
  if (seconds === 1) return 'per second';
  if (seconds === 60) return 'per minute';
  if (seconds === 3600) return 'per hour';
  if (seconds === 86400) return 'per day';
  return `per ${seconds}s`;
}

export function RateLimitObservationCard({
  apiId,
  loading = false,
}: RateLimitObservationCardProps) {
  const { data, isLoading } = useRateLimitObservations(apiId);
  const observations = (data ?? []) as RateLimitObservation[];
  const latest = observations[0];

  if (loading || isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rate Limit Observations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            Rate Limit Observations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No rate-limit observations have been recorded for this API yet.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/apis/${apiId}/rate-limit/observations`}>
                View observations
                <ExternalLink className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const throttledCount = observations.filter((observation) => observation.response_status === 429).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-yellow-600" />
          Rate Limit Observations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Observations</p>
            <p className="text-lg font-semibold">{observations.length}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">429 Responses</p>
            <p className="text-lg font-semibold">{throttledCount}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Latest Header</p>
            <p className="text-sm font-medium">
              {latest.source_header || 'Unavailable'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Latest Window</p>
            <p className="text-sm font-medium">
              {latest.limit_per_window
                ? `${latest.limit_per_window} ${formatWindow(latest.window_seconds)}`
                : 'Unavailable'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Most Recent</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={latest.response_status >= 400 ? 'destructive' : 'secondary'}>
              {latest.response_status}
            </Badge>
            <span className="text-muted-foreground">
              {new Date(latest.observed_at).toLocaleString()}
            </span>
          </div>
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/apis/${apiId}/rate-limit/observations`}>
            Open full observations page
            <ExternalLink className="ml-2 size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
