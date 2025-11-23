"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ChartSkeletonProps {
  showHeader?: boolean;
  height?: number;
}

/**
 * Chart skeleton with animated bars
 * Shows a beautiful placeholder for chart loading
 */
export function ChartSkeleton({
  showHeader = true,
  height = 300,
}: ChartSkeletonProps) {
  const bars = 7; // Number of bars in the chart

  // Generate stable random heights
  const barHeights = React.useMemo(
    () => Array.from({ length: bars }, () => 40 + Math.random() * 60),
    [bars]
  );

  return (
    <Card className="border-2">
      {showHeader && (
        <CardHeader>
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </CardHeader>
      )}
      <CardContent className="pt-6">
        <div className="relative" style={{ height: `${height}px` }}>
          {/* Y-axis */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-8" />
            ))}
          </div>

          {/* Chart area */}
          <div className="ml-12 h-full flex items-end justify-around gap-2 pb-8">
            {barHeights.map((randomHeight, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <Skeleton
                  className="w-full rounded-t-md"
                  style={{
                    height: `${randomHeight}%`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
