"use client";

import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  title?: string;
  description?: string;
}

/**
 * Lightweight error fallback component
 * Can be used standalone or with ErrorBoundary
 */
export function ErrorFallback({
  error,
  resetError,
  title = "Something Went Wrong",
  description = "We encountered an unexpected error. Don't worry, it's not your fault!",
}: ErrorFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-6 text-destructive" />
            <CardTitle>{title}</CardTitle>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        {error && (
          <CardContent>
            <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
              <p className="text-sm font-medium text-destructive mb-1">
                Error Details
              </p>
              <p className="text-sm text-muted-foreground font-mono break-all">
                {error.message || "Unknown error"}
              </p>
            </div>
          </CardContent>
        )}

        <CardFooter className="flex gap-2">
          {resetError && (
            <Button onClick={resetError} className="gap-2 flex-1">
              <RefreshCw className="size-4" />
              Try Again
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/dashboard")}
            className="gap-2 flex-1"
          >
            <Home className="size-4" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
