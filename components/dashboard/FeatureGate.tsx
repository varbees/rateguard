"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";

interface FeatureGateProps {
  featureName: string;
  requiredPlan: "pro" | "business";
  description?: string;
}

export function FeatureGate({
  featureName,
  requiredPlan,
  description,
}: FeatureGateProps) {
  const router = useRouter();

  const handleUpgrade = () => {
    router.push("/dashboard/billing");
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <Card className="max-w-md w-full border-primary/20">
        <CardContent className="pt-6">
          <div className="text-center space-y-6">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="size-8 text-primary" />
            </div>

            {/* Title */}
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                {featureName}
              </h3>
              <p className="text-sm text-muted-foreground">
                {description ||
                  `This feature requires a ${
                    requiredPlan === "business" ? "Business" : "Pro"
                  } plan or higher.`}
              </p>
            </div>

            {/* Benefits */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-left">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {requiredPlan === "business" ? "Business" : "Pro"} Plan
                Includes:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {requiredPlan === "pro" && (
                  <>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      Advanced Analytics & Insights
                    </li>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      10 APIs & 3M Monthly Requests
                    </li>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      Custom Rate Limits
                    </li>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      API Access
                    </li>
                  </>
                )}
                {requiredPlan === "business" && (
                  <>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      50 APIs & 30M Monthly Requests
                    </li>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      Priority Support
                    </li>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      Webhooks & Integrations
                    </li>
                    <li className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary shrink-0" />
                      Advanced Analytics
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* CTA */}
            <Button onClick={handleUpgrade} className="w-full gap-2" size="lg">
              <TrendingUp className="size-4" />
              Upgrade to {requiredPlan === "business" ? "Business" : "Pro"}
            </Button>

            {/* Secondary CTA */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard/billing")}
              className="w-full text-xs text-muted-foreground"
            >
              View All Plans & Pricing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
