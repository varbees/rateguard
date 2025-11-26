"use client";

import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  XCircle 
} from "lucide-react";
import { type WebhookEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DeliveryStatusBadgeProps {
  status: WebhookEvent["status"];
  className?: string;
}

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    variant: "secondary" as const,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    animate: false,
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    variant: "secondary" as const,
    className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    animate: true,
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle2,
    variant: "secondary" as const,
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    animate: false,
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    variant: "secondary" as const,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    animate: false,
  },
  dead_letter: {
    label: "Dead Letter",
    icon: XCircle,
    variant: "destructive" as const,
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    animate: false,
  },
};

export function DeliveryStatusBadge({ status, className }: DeliveryStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "flex items-center gap-1.5 font-medium",
        config.className,
        className
      )}
    >
      <Icon 
        className={cn(
          "h-3.5 w-3.5",
          config.animate && "animate-spin"
        )} 
      />
      {config.label}
    </Badge>
  );
}
