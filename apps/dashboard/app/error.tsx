"use client";

import { useEffect } from "react";
import {
  AlertTriangle,
  RefreshCw,
  Home,
  ExternalLink,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Global Error Page (500)
 * Handles unexpected errors in the application
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application Error:", error);
  }, [error]);

  const copyErrorDetails = () => {
    const details = {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    navigator.clipboard.writeText(JSON.stringify(details, null, 2));
    alert("Error details copied to clipboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-destructive/50">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <div className="rounded-full bg-destructive/10 p-6">
              <AlertTriangle className="size-16 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl">Something Went Wrong</CardTitle>
          <CardDescription className="text-base">
            We encountered an unexpected error. Don&apos;t worry, it&apos;s not
            your fault!
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Error Message */}
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription className="font-mono text-xs break-all">
              {error.message || "An unexpected error occurred"}
            </AlertDescription>
          </Alert>

          {/* Error Reference */}
          {error.digest && (
            <div className="rounded-lg bg-muted p-3 border text-center">
              <p className="text-xs text-muted-foreground mb-1">
                Error Reference
              </p>
              <code className="text-xs font-mono">{error.digest}</code>
            </div>
          )}

          {/* What to do next */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What you can try:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Click &quot;Try Again&quot; to reload the page</li>
              <li>Go back to the dashboard</li>
              <li>Clear your browser cache and cookies</li>
              <li>If the problem persists, contact our support team</li>
            </ul>
          </div>

          {/* Support Links */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() =>
                window.open("https://status.rateguard.dev", "_blank")
              }
            >
              <ExternalLink className="size-4" />
              Check System Status
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() =>
                window.open("mailto:support@rateguard.dev", "_blank")
              }
            >
              <ExternalLink className="size-4" />
              Contact Support
            </Button>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button onClick={reset} className="gap-2 flex-1">
            <RefreshCw className="size-4" />
            Try Again
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/dashboard")}
            className="gap-2 flex-1"
          >
            <Home className="size-4" />
            Go Home
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={copyErrorDetails}
            title="Copy error details"
          >
            <Bug className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
