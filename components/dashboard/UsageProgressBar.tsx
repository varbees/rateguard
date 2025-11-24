"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface UsageProgressBarProps {
  label: string; // "Daily Requests"
  current: number; // 8500
  limit: number; // 10000
  percentage: number; // 85
  resetTime?: Date; // When the usage resets
  className?: string;
}

export function UsageProgressBar({
  label,
  current,
  limit,
  percentage,
  resetTime,
  className,
}: UsageProgressBarProps) {
  // Determine color based on percentage
  const getColorClasses = (pct: number) => {
    if (pct >= 95) {
      return {
        bg: "bg-red-500",
        text: "text-red-600",
        ring: "ring-red-500/20",
        pulse: true,
      };
    }
    if (pct >= 80) {
      return {
        bg: "bg-orange-500",
        text: "text-orange-600",
        ring: "ring-orange-500/20",
        pulse: false,
      };
    }
    if (pct >= 50) {
      return {
        bg: "bg-yellow-500",
        text: "text-yellow-600",
        ring: "ring-yellow-500/20",
        pulse: false,
      };
    }
    return {
      bg: "bg-green-500",
      text: "text-green-600",
      ring: "ring-green-500/20",
      pulse: false,
    };
  };

  const colorClasses = getColorClasses(percentage);

  // Calculate time until reset
  const getResetTimeMessage = () => {
    if (!resetTime) return null;

    const now = new Date();
    const diffMs = resetTime.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
      return `Resets in ${diffHours}h ${diffMinutes}m`;
    }
    return `Resets in ${diffMinutes}m`;
  };

  // Format numbers with commas
  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  // Handle unlimited case
  const isUnlimited = limit === 0;

  return (
    <TooltipProvider>
      <div className={cn("space-y-2", className)}>
        {/* Label */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {label}
          </span>
          {resetTime && (
            <span className="text-xs text-muted-foreground">
              {getResetTimeMessage()}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {isUnlimited ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  "bg-gradient-to-r from-blue-500 to-cyan-500"
                )}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      colorClasses.bg,
                      colorClasses.pulse && "animate-pulse"
                    )}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {formatNumber(current)} of {formatNumber(limit)} requests used
              </p>
              {resetTime && (
                <p className="text-xs text-muted-foreground">
                  {getResetTimeMessage()}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Stats below */}
        <div className="flex items-center justify-between text-xs">
          {isUnlimited ? (
            <>
              <span className="font-medium">
                {formatNumber(current)} requests
              </span>
              <span className="text-blue-600 font-semibold">Unlimited</span>
            </>
          ) : (
            <>
              <span className={cn("font-medium", colorClasses.text)}>
                {formatNumber(current)} / {formatNumber(limit)}
              </span>
              <span className={cn("font-semibold", colorClasses.text)}>
                {percentage.toFixed(1)}%
              </span>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
