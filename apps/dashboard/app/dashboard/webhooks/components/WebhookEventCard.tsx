"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type WebhookEvent } from "@/lib/api";
import { DeliveryStatusBadge } from "./DeliveryStatusBadge";
import { ChevronRight, RotateCw, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface WebhookEventCardProps {
  event: WebhookEvent;
  onExpand: (event: WebhookEvent) => void;
  onRetry?: (eventId: string) => void;
  isRetrying?: boolean;
}

export function WebhookEventCard({ 
  event, 
  onExpand, 
  onRetry,
  isRetrying = false 
}: WebhookEventCardProps) {
  const canRetry = (event.status === "failed" || event.status === "dead_letter") && onRetry;
  const truncateUrl = (url: string, maxLength = 40) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + "...";
  };

  return (
    <Card
      className={cn(
        "p-4 transition-all hover:shadow-md cursor-pointer",
        "border-l-4",
        event.status === "delivered" && "border-l-green-500",
        event.status === "failed" && "border-l-orange-500",
        event.status === "dead_letter" && "border-l-red-500",
        event.status === "pending" && "border-l-blue-500",
        event.status === "processing" && "border-l-yellow-500"
      )}
      onClick={() => onExpand(event)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Header: Source and Event Type */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">
              {event.source}
            </Badge>
            <span className="text-sm text-muted-foreground">•</span>
            <span className="text-sm font-medium">{event.event_type}</span>
          </div>

          {/* Target URL */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate font-mono text-xs">
              {truncateUrl(event.target_url)}
            </span>
          </div>

          {/* Footer: Status and Timestamp */}
          <div className="flex items-center gap-3 flex-wrap">
            <DeliveryStatusBadge status={event.status} />
            
            {event.retries > 0 && (
              <Badge variant="secondary" className="text-xs">
                {event.retries}/{event.max_retries} retries
              </Badge>
            )}
            
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* Error Message (if failed) */}
          {event.last_error && (
            <p className="text-xs text-red-600 dark:text-red-400 line-clamp-1">
              {event.last_error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(event.id);
              }}
              disabled={isRetrying}
              className="h-8 w-8 p-0"
            >
              <RotateCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />
            </Button>
          )}
          
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}
