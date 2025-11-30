"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCw,
  Trash2,
  Eye,
  Inbox,
  Loader2,
} from "lucide-react";
import {
  useWebhookStatus,
  useRetryWebhookEvent,
  useDeleteWebhookEvent,
} from "@/lib/hooks/use-webhooks";
import { cn } from "@/lib/utils";
import type { WebhookEvent } from "@/lib/api";

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config = {
    delivered: {
      icon: CheckCircle2,
      label: "Delivered",
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    },
    failed: {
      icon: XCircle,
      label: "Failed",
      className: "bg-red-500/10 text-red-500 border-red-500/20",
    },
    pending: {
      icon: Clock,
      label: "Pending",
      className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    },
    processing: {
      icon: Loader2,
      label: "Processing",
      className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    },
    dead_letter: {
      icon: AlertTriangle,
      label: "Dead Letter",
      className: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    },
  }[status] ?? {
    icon: Clock,
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", config.className)}
    >
      <Icon
        className={cn("w-3 h-3", status === "processing" && "animate-spin")}
      />
      {config.label}
    </Badge>
  );
}

// Event row component with animations
function EventRow({
  event,
  onRetry,
  onDelete,
  isRetrying,
}: {
  event: WebhookEvent;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  isRetrying: boolean;
}) {
  const canRetry = ["failed", "dead_letter"].includes(event.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="group flex items-center gap-4 p-4 border-b last:border-0 hover:bg-muted/30 transition-colors"
    >
      {/* Timeline indicator */}
      <div className="hidden sm:flex flex-col items-center">
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full",
            event.status === "delivered" && "bg-emerald-500",
            event.status === "failed" && "bg-red-500",
            event.status === "pending" && "bg-amber-500",
            event.status === "processing" && "bg-blue-500 animate-pulse",
            event.status === "dead_letter" && "bg-purple-500"
          )}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate">
            {event.event_type}
          </span>
          <StatusBadge status={event.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
            {event.source}
          </span>
          <span>•</span>
          <span title={format(new Date(event.created_at), "PPpp")}>
            {formatDistanceToNow(new Date(event.created_at), {
              addSuffix: true,
            })}
          </span>
          {event.retries > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-500">{event.retries} retries</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {canRetry && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onRetry(event.id)}
            disabled={isRetrying}
          >
            <RotateCw className={cn("w-4 h-4", isRetrying && "animate-spin")} />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Eye className="w-4 h-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {canRetry && (
              <DropdownMenuItem onClick={() => onRetry(event.id)}>
                <RotateCw className="w-4 h-4 mr-2" />
                Retry Now
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(event.id)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

// Empty state
function EmptyEvents() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-1">No events yet</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Webhook events will appear here once your configured providers start
        sending them.
      </p>
    </div>
  );
}

export function WebhookEventsTable() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState("");

  const pageSize = 10;

  // Use isFetching instead of isLoading for background updates
  const { data, isLoading, isFetching, refetch } = useWebhookStatus({
    page,
    page_size: pageSize,
    status: statusFilter === "all" ? undefined : statusFilter,
    source: sourceFilter || undefined,
  });

  const retryMutation = useRetryWebhookEvent();
  const deleteMutation = useDeleteWebhookEvent();

  const handleRetry = (id: string) => {
    retryMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this event?")) {
      deleteMutation.mutate(id);
    }
  };

  const events = data?.events ?? [];
  const totalCount = data?.total_count ?? 0;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Event Log</h3>
            <p className="text-sm text-muted-foreground">
              {totalCount > 0 ? `${totalCount} events` : "No events yet"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Subtle sync indicator */}
            <AnimatePresence>
              {isFetching && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Syncing
                </motion.div>
              )}
            </AnimatePresence>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by source..."
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="pl-9 h-9 bg-background"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px] h-9 bg-background">
              <Filter className="mr-2 h-3.5 w-3.5" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="dead_letter">Dead Letter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Events List */}
      <div className="divide-y">
        {isLoading ? (
          // Initial loading skeleton
          [...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
              <div className="hidden sm:block w-2.5 h-2.5 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-5 w-20 bg-muted rounded-full" />
                </div>
                <div className="h-3 w-48 bg-muted rounded" />
              </div>
            </div>
          ))
        ) : events.length === 0 ? (
          <EmptyEvents />
        ) : (
          <AnimatePresence mode="popLayout">
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onRetry={handleRetry}
                onDelete={handleDelete}
                isRetrying={retryMutation.isPending}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between p-4 border-t bg-muted/20">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
