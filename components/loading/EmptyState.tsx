"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  compact?: boolean;
}

/**
 * Reusable empty state component with optional actions
 * Creates a delightful experience when there's no data
 */
export function EmptyState({
  icon: Icon,
  emoji,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <Card className={cn("border-2", className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-12" : "py-20"
        )}
      >
        {/* Icon or Emoji */}
        <div
          className={cn(
            "mb-6 flex items-center justify-center",
            compact ? "mb-4" : "mb-6"
          )}
        >
          {emoji ? (
            <div
              className={cn(
                "flex items-center justify-center rounded-full bg-primary/10",
                compact ? "size-16 text-4xl" : "size-24 text-6xl"
              )}
            >
              {emoji}
            </div>
          ) : Icon ? (
            <div
              className={cn(
                "flex items-center justify-center rounded-full bg-primary/10 p-6",
                compact ? "p-4" : "p-6"
              )}
            >
              <Icon
                className={cn("text-primary", compact ? "size-8" : "size-12")}
              />
            </div>
          ) : null}
        </div>

        {/* Title */}
        <h3
          className={cn(
            "font-bold text-foreground mb-3",
            compact ? "text-xl" : "text-2xl"
          )}
        >
          {title}
        </h3>

        {/* Description */}
        <p
          className={cn(
            "text-muted-foreground max-w-md mb-6",
            compact ? "text-sm mb-4" : "text-base mb-6"
          )}
        >
          {description}
        </p>

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className="flex flex-col sm:flex-row gap-3">
            {action && (
              <Button
                onClick={action.onClick}
                size={compact ? "default" : "lg"}
                className="gap-2"
              >
                {action.icon && <action.icon className="size-4" />}
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                onClick={secondaryAction.onClick}
                variant="outline"
                size={compact ? "default" : "lg"}
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
