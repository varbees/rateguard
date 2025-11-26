"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { type WebhookEvent } from "@/lib/api";
import { WebhookEventCard } from "./WebhookEventCard";
import { EventDetailsDialog } from "./EventDetailsDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebhookEvents } from "../hooks/useWebhookEvents";
import { webhookAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Inbox } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface WebhookEventLogProps {
  statusFilter?: string;
  sourceFilter?: string;
}

export function WebhookEventLog({ statusFilter, sourceFilter }: WebhookEventLogProps) {
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [retryingEvents, setRetryingEvents] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const observerTarget = useRef<HTMLDivElement>(null);

  const {
    events,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useWebhookEvents({
    status: statusFilter,
    source: sourceFilter,
    enablePolling: true,
    pollingInterval: 5000,
  });

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRetry = useCallback(
    async (eventId: string) => {
      setRetryingEvents((prev) => new Set(prev).add(eventId));

      try {
        // Feature detection: Check if retry endpoint is available
        const response = await webhookAPI.retry(eventId);
        
        toast({
          title: "Retry Initiated",
          description: response.message || "Webhook will be retried shortly",
        });

        // Optimistically update the event status in cache
        queryClient.setQueryData(
          ["webhook-events"],
          (old: any) => {
            if (!old) return old;
            return {
              ...old,
              events: old.events.map((e: WebhookEvent) =>
                e.id === eventId ? { ...e, status: "pending" as const } : e
              ),
            };
          }
        );

        // Refetch to get actual status
        setTimeout(() => refetch(), 1000);
      } catch (error: any) {
        // Check if endpoint is not implemented
        if (error?.statusCode === 404) {
          toast({
            title: "Feature Not Available",
            description: "Manual retry endpoint is not yet implemented on the backend",
            variant: "default",
          });
        } else {
          toast({
            title: "Retry Failed",
            description: error?.message || "Failed to retry webhook delivery",
            variant: "destructive",
          });
        }
      } finally {
        setRetryingEvents((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      }
    },
    [toast, queryClient, refetch]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-4 w-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Failed to load webhook events
        </p>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-muted p-6">
            <Inbox className="h-12 w-12 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-1">No webhook events</h3>
            <p className="text-sm text-muted-foreground">
              {statusFilter || sourceFilter
                ? "No events match your filters"
                : "Webhook events will appear here once you start receiving them"}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {events.map((event) => (
          <WebhookEventCard
            key={event.id}
            event={event}
            onExpand={setSelectedEvent}
            onRetry={handleRetry}
            isRetrying={retryingEvents.has(event.id)}
          />
        ))}

        {/* Infinite scroll trigger */}
        <div ref={observerTarget} className="h-4" />

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <EventDetailsDialog
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      />
    </>
  );
}
