"use client";

import { Loader2 } from "lucide-react";

interface LoadingPageProps {
  text?: string;
}

/**
 * Full page loading component
 */
export function LoadingPage({ text = "Loading..." }: LoadingPageProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="size-12 animate-spin mx-auto text-primary" />
        <p className="text-lg text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
