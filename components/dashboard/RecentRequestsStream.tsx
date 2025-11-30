'use client';

import { useState, useEffect } from 'react';
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
import { useUser } from '@/lib/hooks/use-user';
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
  ipAddress?: string;
  userAgent?: string;
}

interface RecentRequestsStreamProps {
  apiId: string;
  requests?: Request[];
  isLive?: boolean;
}

export function RecentRequestsStream({
  apiId,
  requests: initialRequests = [],
  isLive = false,
}: RecentRequestsStreamProps) {
  const { hasAccess } = useUser();
  // Determine max requests based on plan
  const maxRequests = hasAccess('enterprise') ? 100 : hasAccess('pro') ? 50 : 10;

  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Mock data for demo
  const [requests, setRequests] = useState<Request[]>(() => {
    if (initialRequests.length > 0) return initialRequests;
    
    return [
      {
        id: '1',
        timestamp: new Date(Date.now() - 1000),
        method: 'POST',
        path: '/v1/chat/completions',
        statusCode: 200,
        latency: 1245,
        tokens: 1523,
        cost: 0.045,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
      },
      {
        id: '2',
        timestamp: new Date(Date.now() - 5000),
        method: 'GET',
        path: '/v1/models',
        statusCode: 200,
        latency: 234,
        ipAddress: '192.168.1.2',
      },
      {
        id: '3',
        timestamp: new Date(Date.now() - 8000),
        method: 'POST',
        path: '/v1/completions',
        statusCode: 429,
        latency: 89,
        ipAddress: '192.168.1.3',
      },
    ];
  });

  // Simulate live updates
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const newRequest: Request = {
        id: Math.random().toString(),
        timestamp: new Date(),
        method: ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)],
        path: '/v1/chat/completions',
        statusCode: Math.random() > 0.1 ? 200 : 429,
        latency: Math.floor(Math.random() * 2000 + 100),
        tokens: Math.floor(Math.random() * 2000 + 500),
        cost: Math.random() * 0.1,
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
      };

      setRequests((prev) => [newRequest, ...prev].slice(0, maxRequests));
    }, 5000); // New request every 5 seconds

    return () => clearInterval(interval);
  }, [isLive, maxRequests]);

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
    };
    return colors[method] || 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString();
  };

  const handleRequestClick = (request: Request) => {
    setSelectedRequest(request);
    setShowDetails(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Requests
              </CardTitle>
              <CardDescription>
                Real-time request log (last {maxRequests} requests)
              </CardDescription>
            </div>
            {isLive && (
              <Badge variant="outline" className="gap-1 border-green-500/50 bg-green-500/10">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Live
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!hasAccess('pro') && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <strong>💡 Pro Feature:</strong> Upgrade to Pro for 50 requests, or Enterprise for 100 requests with full details.
              </p>
            </div>
          )}

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {requests.length === 0 ? (
                <div className="text-center py-8 ter-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No requests yet</p>
                  <p className="text-xs mt-1">Requests will appear here in real-time</p>
                </div>
              ) : (
                requests.map((request, index) => (
                  <div
                    key={request.id}
                    className={cn(
                      'p-3 border rounded-lg hover:bg-accent cursor-pointer transition-all',
                      index === 0 && isLive && 'animate-in fade-in slide-in-from-top-2 duration-300'
                    )}
                    onClick={() => handleRequestClick(request)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn('text-xs font-mono', getMethodColor(request.method))}>
                            {request.method}
                          </Badge>
                          <Badge className={cn('text-xs', getStatusColor(request.statusCode))}>
                            {request.statusCode}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {request.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {request.latency}ms
                          </span>
                          {hasAccess('pro') && request.tokens && (
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {request.tokens} tokens
                            </span>
                          )}
                          {hasAccess('pro') && request.cost && (
                            <span className="flex items-center gap-1">
                              ${request.cost.toFixed(4)}
                            </span>
                          )}
                          {hasAccess('enterprise') && request.ipAddress && (
                            <span className="font-mono">{request.ipAddress}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
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

      {/* Request Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              Full details for this API request
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              {/* Status Overview */}
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
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

              {/* Request Info */}
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
                  {hasAccess('pro') && selectedRequest.tokens && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Tokens:</span>
                        <div className="font-mono">{selectedRequest.tokens}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cost:</span>
                        <div className="font-mono">${selectedRequest.cost?.toFixed(4)}</div>
                      </div>
                    </>
                  )}
                  {hasAccess('enterprise') && selectedRequest.ipAddress && (
                    <div>
                      <span className="text-muted-foreground">IP Address:</span>
                      <div className="font-mono">{selectedRequest.ipAddress}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payload Preview */}
              <div className="space-y-2">
                <h4 className="font-semibold">Request Path</h4>
                <div className="p-3 bg-muted rounded-lg font-mono text-sm">
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
