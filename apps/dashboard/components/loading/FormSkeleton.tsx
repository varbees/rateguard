"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface FormSkeletonProps {
  fields?: number;
  showHeader?: boolean;
  showButtons?: boolean;
}

/**
 * Form skeleton with disabled input placeholders
 * Shows loading state for forms
 */
export function FormSkeleton({
  fields = 5,
  showHeader = true,
  showButtons = true,
}: FormSkeletonProps) {
  // Generate stable random values for helper text visibility
  const showHelperText = React.useMemo(
    () => Array.from({ length: fields }, () => Math.random() > 0.7),
    [fields]
  );

  return (
    <Card className="border-2">
      {showHeader && (
        <CardHeader>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
      )}
      <CardContent className="space-y-6">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            {showHelperText[i] && <Skeleton className="h-3 w-48" />}
          </div>
        ))}
        {showButtons && (
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
