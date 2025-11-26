"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type WebhookEvent } from "@/lib/api";
import { DeliveryStatusBadge } from "./DeliveryStatusBadge";
import { 
  Clock, 
  ExternalLink, 
  Code, 
  FileJson,
  Activity,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";

interface EventDetailsDialogProps {
  event: WebhookEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function JsonViewer({ data }: { data: unknown }) {
  return (
    <ScrollArea className="h-[300px] w-full rounded-md border">
      <pre className="p-4 text-xs font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ScrollArea>
  );
}

function KeyValueList({ data }: { data: Record<string, string> | undefined }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No data available</p>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex items-start gap-2 text-sm">
          <span className="font-medium text-muted-foreground min-w-[120px]">
            {key}:
          </span>
          <span className="font-mono break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}

function DeliveryTimeline({ event }: { event: WebhookEvent }) {
  const timeline = [
    {
      label: "Created",
      timestamp: event.created_at,
      icon: Clock,
      color: "text-blue-500",
    },
  ];

  if (event.last_attempt_at) {
    timeline.push({
      label: `Last Attempt (${event.retries}/${event.max_retries})`,
      timestamp: event.last_attempt_at,
      icon: Activity,
      color: event.status === "delivered" ? "text-green-500" : "text-orange-500",
    });
  }

  if (event.delivered_at) {
    timeline.push({
      label: "Delivered",
      timestamp: event.delivered_at,
      icon: Activity,
      color: "text-green-500",
    });
  }

  if (event.next_attempt_at && event.status !== "delivered") {
    timeline.push({
      label: "Next Retry",
      timestamp: event.next_attempt_at,
      icon: Clock,
      color: "text-yellow-500",
    });
  }

  return (
    <div className="space-y-4">
      {timeline.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={index} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`rounded-full p-2 ${item.color} bg-current/10`}>
                <Icon className={`h-4 w-4 ${item.color}`} />
              </div>
              {index < timeline.length - 1 && (
                <div className="w-px h-8 bg-border mt-2" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <p className="font-medium text-sm">{item.label}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(item.timestamp), "PPpp")}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EventDetailsDialog({ event, open, onOpenChange }: EventDetailsDialogProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="font-mono">
                  {event.source}
                </Badge>
                <span>•</span>
                <span className="text-base">{event.event_type}</span>
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 text-xs font-mono">
                <ExternalLink className="h-3 w-3" />
                {event.target_url}
              </DialogDescription>
            </div>
            <DeliveryStatusBadge status={event.status} />
          </div>
        </DialogHeader>

        <Tabs defaultValue="payload" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="payload">
              <FileJson className="h-4 w-4 mr-2" />
              Payload
            </TabsTrigger>
            <TabsTrigger value="headers">
              <Code className="h-4 w-4 mr-2" />
              Headers
            </TabsTrigger>
            <TabsTrigger value="response">
              <Activity className="h-4 w-4 mr-2" />
              Response
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <Clock className="h-4 w-4 mr-2" />
              Timeline
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4">
            <TabsContent value="payload" className="mt-0">
              <JsonViewer data={event.payload} />
            </TabsContent>

            <TabsContent value="headers" className="mt-0">
              <Card className="p-4">
                <KeyValueList data={event.headers} />
              </Card>
            </TabsContent>

            <TabsContent value="response" className="mt-0 space-y-4">
              {event.response_status_code ? (
                <>
                  <Card className="p-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Status Code</p>
                        <p className="text-2xl font-bold">{event.response_status_code}</p>
                      </div>
                      {event.last_error && (
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-1">Error</p>
                          <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{event.last_error}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                  
                  {event.response_body && (
                    <div>
                      <p className="text-sm font-medium mb-2">Response Body</p>
                      <ScrollArea className="h-[200px] w-full rounded-md border">
                        <pre className="p-4 text-xs font-mono">
                          {event.response_body}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No response data available yet
                </p>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <Card className="p-4">
                <DeliveryTimeline event={event} />
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
