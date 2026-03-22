'use client';

import { useEffect, useState } from 'react';
import { Activity, ChevronRight, Clock, AlertCircle, Check, X, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import useSWR from 'swr';
import { apiClient, type RecentRequest as ApiRecentRequest } from '@/lib/api';
import { useRequestsWebSocket } from '@/lib/websocket/use-websocket';
import { cn } from '@/lib/utils';

interface Request {
  id: string;
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  latency: number;
  tokens?: number;
  cost?: number;
  apiName?: string;
  apiId?: string;
  rateLimitApplied?: boolean;
  rateLimitAllowed?: boolean;
  circuitBreakerState?: string;
  retryAfterMs?: number;
}

interface RecentRequestsStreamProps {
  apiId: string;
  requests?: Request[];
  isLive?: boolean;
}

function formatRequest(request: ApiRecentRequest | Request): Request {
  if ('response_time_ms' in request) {
    return {
      id: request.id,
      timestamp: new Date(request.timestamp),
      method: request.method,
      path: request.path,
      statusCode: request.status_code,
      latency: request.response_time_ms,
      apiName: request.api_name,
      apiId: request.api_id,
    };
  }

  return request;
}

function formatLiveRequest(payload: Record<string, any>): Request {
  const method = String(payload.method || 'GET').toUpperCase();
  const path = String(payload.path || '/');
  const requestId = String(payload.request_id || payload.trace_id || `${method}:${path}:${Date.now()}`);

  return {
    id: requestId,
    timestamp: new Date(),
    method,
    path,
    statusCode: Number(payload.status_code) || 200,
    latency: Number(payload.latency_ms) || 0,
    tokens: Number(payload.token_total_tokens) || undefined,
    apiName: payload.preset ? `Preset: ${String(payload.preset)}` : 'Gateway',
    apiId: String(payload.route_id || 'gateway'),
    rateLimitApplied: payload.rate_limit_applied,
    rateLimitAllowed: payload.rate_limit_allowed,
    circuitBreakerState: payload.circuit_breaker_state,
    retryAfterMs: Number(payload.retry_after_ms) || undefined,
  };
}

export function RecentRequestsStream({
  apiId,
  requests: initialRequests = [],
  isLive = false,
}: RecentRequestsStreamProps) {
  const maxRequests = 100;
  const isEventsFeed = apiId === 'events';

  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [requests, setRequests] = useState<Request[]>(() => initialRequests);

  const { subscribe, isConnected, hasAccess } = useRequestsWebSocket();
  const { data: fallbackData } = useSWR(
    ['recent-requests', apiId, maxRequests],
    async () => {
      const params = isEventsFeed
        ? { limit: maxRequests }
        : { limit: maxRequests, api_id: apiId };
      return apiClient.getRecentRequests(params);
    },
    { refreshInterval: hasAccess ? 30000 : 15000 }
  );

  useEffect(() => {
    if (initialRequests.length > 0) {
      setRequests(initialRequests.slice(0, maxRequests));
      return;
    }

    if (fallbackData?.requests) {
      setRequests(
        fallbackData.requests
          .map((request) => formatRequest(request))
          .slice(0, maxRequests)
      );
    }
  }, [fallbackData, initialRequests]);

  useEffect(() => {
    if (!isLive || !isEventsFeed || !isConnected) return;

    const upsertLiveRequest = (payload: Record<string, any>) => {
      const newRequest = formatLiveRequest(payload);

      setRequests((prev) => {
        const withoutDuplicate = prev.filter((request) => request.id !== newRequest.id);
        return [newRequest, ...withoutDuplicate].slice(0, maxRequests);
      });

      setSelectedRequest((current) =>
        current && current.id === newRequest.id ? newRequest : current
      );
    };

    const unsubscribeCompleted = subscribe('request.completed', upsertLiveRequest);
    const unsubscribeRateLimited = subscribe('request.rate_limited', upsertLiveRequest);

    return () => {
      unsubscribeCompleted();
      unsubscribeRateLimited();
    };
  }, [isConnected, isEventsFeed, isLive, maxRequests, subscribe]);

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (status >= 400 && status < 500) return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
    if (status >= 500) return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
      POST: 'text-green-600 bg-green-50 dark:bg-green-900/20',
      PUT: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
      DELETE: 'text-red-600 bg-red-50 dark:bg-red-900/20',
      PATCH: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
    };
    return colors[method] || 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
  };

  const formatTimestamp = (date: Date) => {
    const diff = Date.now() - date.getTime();

    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString();
  };

  const handleRequestClick = (request: Request) => {
    setSelectedRequest(request);
    setShowDetails(true);
  };

  const liveLabel = isEventsFeed
    ? 'Gateway self-protection activity'
    : 'Recent Requests';

  const liveDescription = isEventsFeed
    ? 'Real-time request log from the control plane. Burst traffic and 429s show the self-protection loop in action.'
    : `Recent request log for ${apiId}`;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                {liveLabel}
              </CardTitle>
              <CardDescription>{liveDescription}</CardDescription>
            </div>
            {isLive && (
              <Badge variant="outline" className="gap-1 border-green-500/50 bg-green-500/10">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {requests.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Activity className="mx-auto mb-2 h-12 w-12 opacity-50" />
                  <p>No requests yet</p>
                  <p className="mt-1 text-xs">Requests will appear here in real time</p>
                </div>
              ) : (
                requests.map((request, index) => (
                  <div
                    key={request.id}
                    className={cn(
                      'cursor-pointer rounded-lg border p-3 transition-all hover:bg-accent',
                      index === 0 && isLive && 'animate-in fade-in slide-in-from-top-2 duration-300'
                    )}
                    onClick={() => handleRequestClick(request)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge className={cn('text-xs font-mono', getMethodColor(request.method))}>
                            {request.method}
                          </Badge>
                          <Badge className={cn('text-xs', getStatusColor(request.statusCode))}>
                            {request.statusCode}
                          </Badge>
                          {request.rateLimitApplied !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {request.rateLimitAllowed === false ? 'Rate limited' : 'Protected'}
                            </Badge>
                          )}
                          {request.circuitBreakerState && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {request.circuitBreakerState}
                            </Badge>
                          )}
                          <span className="truncate text-xs text-muted-foreground">{request.path}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {request.latency}ms
                          </span>
                          {request.tokens && (
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {request.tokens} tokens
                            </span>
                          )}
                          {request.apiName && (
                            <span className="truncate">{request.apiName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTimestamp(request.timestamp)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>Full details for this request or self-protection event</DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-muted p-4">
                {selectedRequest.statusCode >= 200 && selectedRequest.statusCode < 300 ? (
                  <Check className="h-8 w-8 text-green-600" />
                ) : selectedRequest.statusCode === 429 ? (
                  <AlertCircle className="h-8 w-8 text-orange-600" />
                ) : (
                  <X className="h-8 w-8 text-red-600" />
                )}
                <div>
                  <div className="font-semibold">
                    {selectedRequest.method} {selectedRequest.path}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Status: {selectedRequest.statusCode} • {selectedRequest.latency}ms latency
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold">Request Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Timestamp:</span>
                    <div className="font-mono">{selectedRequest.timestamp.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Method:</span>
                    <div className="font-semibold">{selectedRequest.method}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status Code:</span>
                    <div className="font-semibold">{selectedRequest.statusCode}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Latency:</span>
                    <div className="font-mono">{selectedRequest.latency}ms</div>
                  </div>
                  {selectedRequest.apiName && (
                    <div>
                      <span className="text-muted-foreground">Source:</span>
                      <div className="font-semibold">{selectedRequest.apiName}</div>
                    </div>
                  )}
                  {selectedRequest.tokens && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Tokens:</span>
                        <div className="font-mono">{selectedRequest.tokens}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cost:</span>
                        <div className="font-mono">
                          {selectedRequest.cost !== undefined ? `$${selectedRequest.cost.toFixed(4)}` : '—'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {(selectedRequest.rateLimitApplied !== undefined ||
                selectedRequest.circuitBreakerState ||
                selectedRequest.retryAfterMs) && (
                <div className="space-y-3">
                  <h4 className="font-semibold">Self-Protection</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Rate limit applied:</span>
                      <div className="font-semibold">
                        {selectedRequest.rateLimitApplied ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Rate limit allowed:</span>
                      <div className="font-semibold">
                        {selectedRequest.rateLimitAllowed === false ? 'Rejected' : 'Allowed'}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Circuit breaker:</span>
                      <div className="font-semibold capitalize">
                        {selectedRequest.circuitBreakerState || 'closed'}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Retry after:</span>
                      <div className="font-mono">
                        {selectedRequest.retryAfterMs ? `${selectedRequest.retryAfterMs}ms` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-semibold">Request Path</h4>
                <div className="rounded-lg bg-muted p-3 font-mono text-sm">
                  {selectedRequest.path}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
