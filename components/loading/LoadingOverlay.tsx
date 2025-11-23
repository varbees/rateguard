"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  text?: string;
  isVisible: boolean;
  className?: string;
}

/**
 * Loading overlay component
 * Shows a semi-transparent overlay with loading spinner
 */
export function LoadingOverlay({
  text = "Loading...",
  isVisible,
  className,
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center",
        className
      )}
    >
      <div className="text-center space-y-4">
        <Loader2 className="size-12 animate-spin mx-auto text-primary" />
        <p className="text-lg text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
