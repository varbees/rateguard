"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Beaker } from "lucide-react";

export function EnvironmentNotice() {
  // Check for test mode environment variable
  const isTestMode = process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === "true";

  if (!isTestMode) return null;

  return (
    <div className="sticky top-0 z-50 w-full">
      <Alert className="rounded-none border-x-0 border-t-0 border-b-2 bg-yellow-500/10 border-yellow-500 text-yellow-500 backdrop-blur-md">
        <Beaker className="h-4 w-4 animate-pulse" />
        <AlertTitle className="font-bold uppercase tracking-wide">Test Mode Active</AlertTitle>
        <AlertDescription className="font-medium">
          You are currently in test mode. No real charges will be made. Use test card numbers for payments.
        </AlertDescription>
      </Alert>
    </div>
  );
}
