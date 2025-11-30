'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  AlertTriangle,
  Copy,
  Check,
  Download,
  RotateCw,
  Trash2
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useWebhookEvent, useRetryWebhookEvent, useDeleteWebhookEvent } from '@/lib/hooks/use-webhooks';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

interface WebhookEventDetailsSheetProps {
  eventId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function WebhookEventDetailsSheet({ eventId, isOpen, onClose }: WebhookEventDetailsSheetProps) {
  const { data: event, isLoading } = useWebhookEvent(eventId || '');
  const retryMutation = useRetryWebhookEvent();
  const deleteMutation = useDeleteWebhookEvent();
  const [copied, setCopied] = useState(false);

  const handleCopyPayload = () => {
    if (event?.payload) {
      navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
      setCopied(true);
      toast.success('Payload copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (event) {
      const blob = new Blob([JSON.stringify(event, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webhook-${event.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleRetry = () => {
    if (eventId) {
      retryMutation.mutate(eventId);
    }
  };

  const handleDelete = () => {
    if (eventId && confirm('Are you sure you want to delete this event?')) {
      deleteMutation.mutate(eventId, {
        onSuccess: () => onClose(),
      });
    }
  };

  const statusConfig = {
    delivered: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
    failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    processing: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    dead_letter: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  };

  if (!eventId) return null;

  const config = event ? (statusConfig[event.status] || statusConfig.pending) : statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full">
        <SheetHeader className="space-y-4">
          <div className="flex items-start justify-between">
            <SheetTitle className="text-xl">Event Details</SheetTitle>
            {event && (
              <Badge variant="outline" className={cn("capitalize gap-1", config.bg, config.color, "border-0")}>
                <StatusIcon className="h-3 w-3" />
                {event.status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-4 w-3/4 bg-muted rounded" />
              <div className="h-4 w-1/2 bg-muted rounded" />
            </div>
          ) : event ? (
            <div className="space-y-1">
              <div className="font-mono text-xs text-muted-foreground">{event.id}</div>
              <div className="font-medium">{event.event_type}</div>
              <div className="text-sm text-muted-foreground">
                {format(new Date(event.created_at), "MMM d, yyyy 'at' h:mm:ss a")}
              </div>
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex-1 py-6 overflow-hidden">
          {event && (
            <Tabs defaultValue="payload" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="payload">Payload</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>
              
              <TabsContent value="payload" className="flex-1 overflow-hidden mt-4 relative">
                <div className="absolute right-2 top-2 z-10 flex gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleCopyPayload}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                <ScrollArea className="h-full rounded-md border bg-muted/50 p-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="headers" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-full rounded-md border">
                  <div className="p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Request Headers</h4>
                      <div className="bg-muted/50 rounded-md p-3 space-y-1">
                        {event.headers ? Object.entries(event.headers).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-3 gap-2 text-xs">
                            <span className="font-mono text-muted-foreground">{key}:</span>
                            <span className="col-span-2 font-mono break-all">{value}</span>
                          </div>
                        )) : (
                          <div className="text-xs text-muted-foreground">No headers recorded</div>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="timeline" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-6 pl-2">
                    {/* Created */}
                    <div className="relative pl-6 border-l-2 border-muted pb-6 last:border-0 last:pb-0">
                      <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-background bg-muted" />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">Event Created</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(event.created_at), "MMM d, h:mm:ss a")}
                        </span>
                      </div>
                    </div>

                    {/* Attempts (Mocked for now as backend type doesn't have full history yet) */}
                    {Array.from({ length: event.retries }).map((_, i) => (
                      <div key={i} className="relative pl-6 border-l-2 border-muted pb-6 last:border-0 last:pb-0">
                        <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-background bg-red-500" />
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-red-600">Delivery Failed (Attempt {i + 1})</span>
                          <span className="text-xs text-muted-foreground">
                            HTTP 500 - Internal Server Error
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Latency: 124ms
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Final Status */}
                    <div className="relative pl-6 border-l-2 border-transparent">
                      <div className={cn(
                        "absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-background",
                        config.bg.replace('/10', '')
                      )} />
                      <div className="flex flex-col gap-1">
                        <span className={cn("text-sm font-medium capitalize", config.color)}>
                          {event.status.replace('_', ' ')}
                        </span>
                        {event.delivered_at && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.delivered_at), "MMM d, h:mm:ss a")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <SheetFooter className="pt-4 border-t">
          <div className="flex w-full justify-between gap-2">
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button 
              onClick={handleRetry}
              disabled={retryMutation.isPending || event?.status === 'delivered'}
            >
              <RotateCw className={cn("mr-2 h-4 w-4", retryMutation.isPending && "animate-spin")} />
              Retry Delivery
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
