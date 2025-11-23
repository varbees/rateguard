"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorBoundary, ErrorFallback } from "@/components/error";

/**
 * Error Handling Showcase Component
 * Demonstrates error boundaries and fallbacks
 *
 * Usage: Add to a page for testing/demo purposes
 */

// Component with controlled error state
function ControlledErrorComponent() {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    throw new Error("This is a controlled test error");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        This component is working fine.
      </p>
      <Button variant="destructive" onClick={() => setHasError(true)}>
        Trigger Error
      </Button>
    </div>
  );
}

export function ErrorShowcase() {
  const [showErrorBoundary, setShowErrorBoundary] = useState(false);
  const [showErrorFallback, setShowErrorFallback] = useState(false);
  const mockError = new Error("This is a mock error for demonstration");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Error Boundary</CardTitle>
          <CardDescription>Catches errors in child components</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => setShowErrorBoundary(!showErrorBoundary)}>
            {showErrorBoundary ? "Hide" : "Show"} Error Boundary Example
          </Button>

          {showErrorBoundary && (
            <ErrorBoundary onReset={() => setShowErrorBoundary(false)}>
              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-sm">Protected Component</CardTitle>
                </CardHeader>
                <CardContent>
                  <ControlledErrorComponent />
                </CardContent>
              </Card>
            </ErrorBoundary>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Error Fallback</CardTitle>
          <CardDescription>Lightweight error display component</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => setShowErrorFallback(!showErrorFallback)}>
            {showErrorFallback ? "Hide" : "Show"} Error Fallback
          </Button>

          {showErrorFallback && (
            <ErrorFallback
              error={mockError}
              resetError={() => setShowErrorFallback(false)}
              title="Failed to Load Data"
              description="We couldn't load the requested data. Please try again."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Error Fallback</CardTitle>
          <CardDescription>Error fallback with custom styling</CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorFallback
            error={new Error("Invalid API configuration detected")}
            title="Configuration Error"
            description="There's an issue with your API configuration"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Error Boundary with Custom Fallback</CardTitle>
          <CardDescription>
            Error boundary using custom fallback UI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorBoundary
            fallback={
              <div className="text-center p-8 border border-destructive/50 rounded-lg bg-destructive/10">
                <h3 className="font-bold text-destructive mb-2">
                  Custom Error UI
                </h3>
                <p className="text-sm text-muted-foreground">
                  This is a custom fallback component
                </p>
              </div>
            }
          >
            <div className="text-sm text-muted-foreground">
              This content is protected by an error boundary with custom
              fallback
            </div>
          </ErrorBoundary>
        </CardContent>
      </Card>

      <Card className="border-yellow-500/50">
        <CardHeader>
          <CardTitle className="text-yellow-600 dark:text-yellow-500">
            ⚠️ Warning
          </CardTitle>
          <CardDescription>
            The &quot;Show Error Boundary Example&quot; button will trigger a
            real error that&apos;s caught by the boundary
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
