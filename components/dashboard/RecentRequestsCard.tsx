/**
 * RecentRequestsCard Component with WebSocket Live Updates
 * 
 * Displays recent API requests in real-time via WebSocket (Pro+)
 * or via HTTP polling (Free plan).
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, ArrowRight, Book } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import useSWR from 'swr';
import { useRequestsWebSocket } from '@/lib/websocket/use-websocket';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { cn } from '@/lib/utils';

interface RecentRequest {
  id: string;
  timestamp: string;
  apiId: string;
  apiName: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  statusCode: number;
  latency: number;
  tokens?: number;
  cost?: number;
}

interface RecentRequestsCardProps {
  loading?: boolean;
  maxRows?: number;
}

function StatusBadge({ code }: { code: number }) {
  const variant =
    code >= 200 && code < 300 ? 'default' :
    code >= 400 && code < 500 ? 'secondary' :
    code >= 500 ? 'destructive' : 'outline';

  const label =
    code === 200 ? 'Success' :
    code === 429 ? 'Rate Limited' :
    code >= 500 ? 'Error' :
    code.toString();

  return (
    <Badge variant={variant} className="font-mono text-xs">
      {label}
    </Badge>
  );
}

function RequestsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>API</TableHead>
          <TableHead>Endpoint</TableHead>
          <TableHead className="text-right">Status</TableHead>
          <TableHead className="text-right">Latency</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RecentRequestsCard({ loading = false, maxRows = 10 }: RecentRequestsCardProps) {
  const [requests, setRequests] = useState<RecentRequest[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // WebSocket for real-time updates (Pro+)
  const { status, subscribe, isConnected, hasAccess } = useRequestsWebSocket();

  // HTTP fallback
  const shouldPoll = !hasAccess || status === 'error';
  const { data: fallbackData } = useSWR(
    shouldPoll ? `/api/v1/dashboard/requests/recent?limit=${maxRows}` : null,
    { refreshInterval: hasAccess ? 60000 : 30000 }
  );

  // Subscribe to new requests via WebSocket
  useEffect(() => {
    if (!isConnected) return;

    return subscribe('request_completed', (newRequest: RecentRequest) => {
      setRequests(prev => {
        // Add new request at the top
        const updated = [newRequest, ...prev.slice(0, maxRows - 1)];
        
        // Highlight the new request
        setHighlightedId(newRequest.id);
        setTimeout(() => setHighlightedId(null), 2000);

        return updated;
      });

      // Optional: Play sound notification (if enabled in user preferences)
      // playNotificationSound();
    });
  }, [isConnected, subscribe, maxRows]);

  // Load fallback data
  useEffect(() => {
    if (fallbackData?.requests) {
      setRequests(fallbackData.requests);
    }
  }, [fallbackData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div>
              <CardTitle>Recent Requests</CardTitle>
              <CardDescription>
                Latest API calls across all projects
              </CardDescription>
            </div>
            {hasAccess && (
              <ConnectionStatusIndicator status={status} showLabel={false} />
            )}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/analytics">
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <RequestsTableSkeleton />
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Requests Yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-4">
              Make your first API call to see activity here
            </p>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/docs/quickstart">
                  <Book className="mr-2 h-4 w-4" />
                  Integration Guide
                </Link>
              </Button>
              <Button variant="default" size="sm" asChild>
                <Link href="/dashboard/apis">View APIs</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                Recent API requests showing time, API name, endpoint, status, and latency
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Time</TableHead>
                  <TableHead scope="col">API</TableHead>
                  <TableHead scope="col">Endpoint</TableHead>
                  <TableHead scope="col" className="text-right">Status</TableHead>
                  <TableHead scope="col" className="text-right">Latency</TableHead>
                  <TableHead scope="col" className="text-right hidden md:table-cell">
                    Tokens
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow
                    key={req.id}
                    className={cn(
                      'hover:bg-muted/50 cursor-pointer transition-colors',
                      highlightedId === req.id && 'bg-primary/10 animate-pulse'
                    )}
                    tabIndex={0}
                    role="button"
                    aria-label={`Request to ${req.apiName} at ${formatDistanceToNow(new Date(req.timestamp), { addSuffix: true })}, status ${req.statusCode}`}
                    onClick={() => window.location.href = `/dashboard/apis/${req.apiId}?request=${req.id}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        window.location.href = `/dashboard/apis/${req.apiId}?request=${req.id}`;
                      }
                    }}
                  >
                    <TableCell className="font-mono text-xs">
                      <time dateTime={req.timestamp}>
                        {formatDistanceToNow(new Date(req.timestamp), { addSuffix: true })}
                      </time>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{req.apiName}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">
                      <span className="text-muted-foreground">{req.method}</span> {req.endpoint}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge code={req.statusCode} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {req.latency}ms
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs hidden md:table-cell">
                      {req.tokens ? req.tokens.toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Free plan notice */}
        {!hasAccess && requests.length > 0 && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            ⏱️ Updates every 30 seconds • Upgrade to Pro for live updates
          </p>
        )}
      </CardContent>
    </Card>
  );
}
