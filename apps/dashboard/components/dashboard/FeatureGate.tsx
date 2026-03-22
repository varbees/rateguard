"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";

interface FeatureGateProps {
  featureName: string;
  description?: string;
}

export function FeatureGate({ featureName, description }: FeatureGateProps) {
  const router = useRouter();

  const handleReview = () => {
    router.push("/dashboard/budget");
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <Card className="max-w-md w-full border-primary/20">
        <CardContent className="pt-6">
          <div className="text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="size-8 text-primary" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                {featureName}
              </h3>
              <p className="text-sm text-muted-foreground">
                {description ||
                  "This feature is available through policy presets and guardrail settings."}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-left">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Guardrails Include:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary shrink-0" />
                  Policy presets for throughput and cost control
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary shrink-0" />
                  Realtime analytics and event delivery
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary shrink-0" />
                  Custom rate limits and webhooks
                </li>
              </ul>
            </div>

            <Button onClick={handleReview} className="w-full gap-2" size="lg">
              <TrendingUp className="size-4" />
              Review Guardrails
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleReview}
              className="w-full text-xs text-muted-foreground"
            >
              Open Cost Guardrails
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
