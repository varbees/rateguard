'use client';

import { formatDistanceToNow } from 'date-fns';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RotateCw, 
  MoreVertical, 
  Trash2, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WebhookEvent } from '@/lib/api';
import { cn } from '@/lib/utils';

interface WebhookEventRowProps {
  event: WebhookEvent;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onViewDetails: (id: string) => void;
  isRetrying?: boolean;
  isDeleting?: boolean;
}

export function WebhookEventRow({
  event,
  onRetry,
  onDelete,
  onViewDetails,
  isRetrying,
  isDeleting,
}: WebhookEventRowProps) {
  const statusConfig = {
    delivered: { icon: CheckCircle2, color: 'text-green-500', badge: 'bg-green-500/10 text-green-500 hover:bg-green-500/20' },
    failed: { icon: XCircle, color: 'text-red-500', badge: 'bg-red-500/10 text-red-500 hover:bg-red-500/20' },
    pending: { icon: Clock, color: 'text-yellow-500', badge: 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' },
    processing: { icon: RefreshCw, color: 'text-blue-500', badge: 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20' },
    dead_letter: { icon: AlertTriangle, color: 'text-orange-500', badge: 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20' },
  };

  const config = statusConfig[event.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <TableRow 
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onViewDetails(event.id)}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("h-4 w-4", config.color)} />
          <Badge variant="outline" className={cn("capitalize border-0", config.badge)}>
            {event.status.replace('_', ' ')}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <div className="font-medium">{event.event_type}</div>
        <div className="text-xs text-muted-foreground md:hidden">{event.source}</div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <code className="text-xs bg-muted px-2 py-1 rounded">{event.source}</code>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onViewDetails(event.id)}>
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onRetry(event.id)}
              disabled={isRetrying || event.status === 'delivered'}
            >
              <RotateCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
              Retry Delivery
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(event.id)}
              className="text-red-600 focus:text-red-600"
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Event
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
