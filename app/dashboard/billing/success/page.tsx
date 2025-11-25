"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";

export default function SuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const orderId = searchParams.get("order_id");

  // Fetch updated dashboard data to show new plan
  const {
    data: dashboardData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dashboard", "success"],
    queryFn: () => apiClient.getDashboardStats(),
    staleTime: 0, // Always fresh
  });

  const plan = dashboardData?.plan;
  const planName = plan?.tier
    ? plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)
    : "Unknown";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 pb-12 text-center space-y-4">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Confirming your payment...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-destructive/10 border-destructive/20">
          <CardContent className="pt-12 pb-12 text-center space-y-4">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <div>
              <h2 className="text-xl font-bold text-destructive">
                Unable to Confirm Payment
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                We couldn&apos;t verify your payment status. Please contact
                support if you were charged.
              </p>
            </div>
            <div className="space-y-2 pt-4">
              <Button
                onClick={() => router.push("/dashboard/billing")}
                className="w-full"
              >
                Back to Billing
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="mailto:support@rateguard.io">Contact Support</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-green-500/20 rounded-full blur-lg" />
              <CheckCircle className="relative h-16 w-16 text-green-500" />
            </div>
          </div>
          <CardTitle className="text-3xl">Payment Successful!</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Plan Confirmation */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">Your new plan</p>
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-2xl font-bold text-foreground">{planName}</h2>
              <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                Active
              </Badge>
            </div>
          </div>

          {/* Session Info */}
          {(sessionId || orderId) && (
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                Transaction ID
              </p>
              <p className="text-xs font-mono text-foreground break-all">
                {sessionId || orderId}
              </p>
            </div>
          )}

          {/* What's Next */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">
              What&apos;s next?
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Your plan is now active and ready to use</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Check your email for a confirmation receipt</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>You can manage your subscription anytime</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-4">
            <Button
              onClick={() => router.push("/dashboard")}
              className="w-full"
            >
              Go to Dashboard
            </Button>
            <Button
              onClick={() => router.push("/dashboard/billing")}
              variant="outline"
              className="w-full"
            >
              Back to Billing
            </Button>
          </div>

          {/* Support Link */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Need help?{" "}
              <a
                href="mailto:support@rateguard.io"
                className="text-primary hover:underline"
              >
                Contact support
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
