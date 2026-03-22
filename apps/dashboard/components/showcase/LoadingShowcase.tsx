"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LoadingSpinner,
  LoadingCard,
  SkeletonCard,
} from "@/components/loading";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingOverlay } from "@/components/loading";

/**
 * Loading States Showcase Component
 * Demonstrates all loading state components
 *
 * Usage: Add to a page for testing/demo purposes
 */
export function LoadingShowcase() {
  const [showOverlay, setShowOverlay] = useState(false);

  const demoOverlay = () => {
    setShowOverlay(true);
    setTimeout(() => setShowOverlay(false), 3000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Loading Spinners</CardTitle>
          <CardDescription>Different sizes and configurations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-8">
            <div className="text-center">
              <LoadingSpinner size="sm" />
              <p className="text-xs text-muted-foreground mt-2">Small</p>
            </div>
            <div className="text-center">
              <LoadingSpinner size="md" />
              <p className="text-xs text-muted-foreground mt-2">Medium</p>
            </div>
            <div className="text-center">
              <LoadingSpinner size="lg" />
              <p className="text-xs text-muted-foreground mt-2">Large</p>
            </div>
            <div className="text-center">
              <LoadingSpinner size="xl" />
              <p className="text-xs text-muted-foreground mt-2">Extra Large</p>
            </div>
          </div>
          <div>
            <LoadingSpinner size="md" text="Loading data..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loading Cards</CardTitle>
          <CardDescription>Card-based loading states</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoadingCard text="Loading API data..." />
          <LoadingCard text="Fetching analytics..." minHeight="min-h-[150px]" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skeleton Cards</CardTitle>
          <CardDescription>Placeholder loading states</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SkeletonCard showHeader={true} lines={3} />
          <SkeletonCard showHeader={false} lines={5} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loading Overlay</CardTitle>
          <CardDescription>Full-screen blocking overlay</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={demoOverlay}>Show Loading Overlay (3s)</Button>
          <LoadingOverlay
            isVisible={showOverlay}
            text="Processing your request..."
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
