"use client";

import React, { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    this.setState({
      error,
      errorInfo,
    });

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    window.location.href = "/dashboard";
  };

  copyErrorDetails = () => {
    const { error, errorInfo } = this.state;
    const details = {
      error: error?.toString(),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    navigator.clipboard.writeText(JSON.stringify(details, null, 2));
    alert("Error details copied to clipboard");
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-lg border-destructive/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-6 text-destructive" />
                <CardTitle>Something Went Wrong</CardTitle>
              </div>
              <CardDescription>
                We encountered an unexpected error. Don&apos;t worry, it&apos;s
                not your fault!
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Error Message */}
              <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
                <p className="text-sm font-medium text-destructive mb-1">
                  Error Details
                </p>
                <p className="text-sm text-muted-foreground font-mono break-all">
                  {this.state.error?.message || "Unknown error"}
                </p>
              </div>

              {/* Development mode: Show stack trace */}
              {process.env.NODE_ENV === "development" &&
                this.state.error?.stack && (
                  <details className="rounded-lg bg-muted p-4 border">
                    <summary className="text-sm font-medium cursor-pointer mb-2">
                      Stack Trace (Development Only)
                    </summary>
                    <pre className="text-xs overflow-auto max-h-48 text-muted-foreground">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}

              {/* What to do next */}
              <div className="space-y-2">
                <p className="text-sm font-medium">What you can try:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Refresh the page to try again</li>
                  <li>Go back to the dashboard</li>
                  <li>Clear your browser cache</li>
                  <li>Contact support if the issue persists</li>
                </ul>
              </div>
            </CardContent>

            <CardFooter className="flex gap-2">
              <Button onClick={this.handleReset} className="gap-2 flex-1">
                <RefreshCw className="size-4" />
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="gap-2 flex-1"
              >
                <Home className="size-4" />
                Go Home
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={this.copyErrorDetails}
                title="Copy error details"
              >
                <Bug className="size-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
