"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LoadingCardProps {
  text?: string;
  className?: string;
  minHeight?: string;
}

/**
 * Loading state for card components
 */
export function LoadingCard({
  text = "Loading...",
  className,
  minHeight = "min-h-[200px]",
}: LoadingCardProps) {
  return (
    <Card className={cn(className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center p-8",
          minHeight
        )}
      >
        <Loader2 className="size-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
