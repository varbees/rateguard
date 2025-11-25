"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Zap, Loader2 } from "lucide-react";

interface PlanFeatures {
  max_apis: number;
  max_requests_per_day: number;
  max_requests_per_month: number;
  advanced_analytics: boolean;
  priority_support: boolean;
  custom_rate_limits: boolean;
  webhooks: boolean;
  api_access: boolean;
}

interface PlanComparisonCardsProps {
  currentTier: string;
  currency: string;
  features?: PlanFeatures;
}

interface Plan {
  id: string;
  name: string;
  tier: string;
  price: number;
  displayPrice: string;
  period: string;
  description: string;
  features: PlanFeatures;
  popular?: boolean;
  cta: string;
}

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    tier: "free",
    price: 0,
    displayPrice: "$0",
    period: "/month",
    description: "Perfect for getting started",
    features: {
      max_apis: 2,
      max_requests_per_day: 10000,
      max_requests_per_month: 300000,
      advanced_analytics: false,
      priority_support: false,
      custom_rate_limits: false,
      webhooks: false,
      api_access: false,
    },
    cta: "Current Plan",
  },
  {
    id: "pro",
    name: "Pro",
    tier: "pro",
    price: 1900,
    displayPrice: "$19",
    period: "/month",
    description: "For growing teams",
    features: {
      max_apis: 10,
      max_requests_per_day: 100000,
      max_requests_per_month: 3000000,
      advanced_analytics: true,
      priority_support: false,
      custom_rate_limits: true,
      webhooks: false,
      api_access: true,
    },
    popular: true,
    cta: "Upgrade to Pro",
  },
  {
    id: "business",
    name: "Business",
    tier: "business",
    price: 4900,
    displayPrice: "$49",
    period: "/month",
    description: "For enterprises",
    features: {
      max_apis: 50,
      max_requests_per_day: 1000000,
      max_requests_per_month: 30000000,
      advanced_analytics: true,
      priority_support: true,
      custom_rate_limits: true,
      webhooks: true,
      api_access: true,
    },
    cta: "Upgrade to Business",
  },
];

const featureLabels: Record<keyof PlanFeatures, string> = {
  max_apis: "Maximum APIs",
  max_requests_per_day: "Daily Requests",
  max_requests_per_month: "Monthly Requests",
  advanced_analytics: "Advanced Analytics",
  priority_support: "Priority Support",
  custom_rate_limits: "Custom Rate Limits",
  webhooks: "Webhooks",
  api_access: "API Access",
};

function formatNumber(num: number): string {
  if (num === 0) return "Unlimited";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

export function PlanComparisonCards({ currentTier }: PlanComparisonCardsProps) {
  const [loadingPlan, setLoadingPlan] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleUpgrade = async (plan: Plan) => {
    try {
      setError(null);
      setLoadingPlan(plan.tier);

      // Determine payment provider based on currency
      // Default to Stripe for now (will be enhanced with geo-detection)
      const provider = "stripe";

      // Call backend checkout endpoint
      const response = await fetch(`/api/v1/billing/${provider}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": localStorage.getItem("apiKey") || "",
        },
        body: JSON.stringify({
          plan_tier: plan.tier,
          billing_cycle: "monthly", // Default to monthly, can be made configurable
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: "Failed to initiate checkout",
        }));
        throw new Error(errorData.message || "Checkout failed");
      }

      const data = await response.json();
      const checkoutUrl = data.checkout_url || data.url;

      if (!checkoutUrl) {
        throw new Error("No checkout URL received from server");
      }

      // Redirect to payment provider
      window.location.href = checkoutUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      setLoadingPlan(null);
      console.error("Checkout error:", err);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Available Plans</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the perfect plan for your needs
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm text-destructive font-medium">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-destructive/70 hover:text-destructive mt-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = plan.tier === currentTier;

          return (
            <Card
              key={plan.id}
              className={`relative bg-card border-border transition-all ${
                plan.popular ? "ring-2 ring-primary md:scale-105" : ""
              } ${isCurrent ? "ring-2 ring-green-500" : ""}`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    <Zap className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}

              {/* Current Badge */}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                    Current Plan
                  </Badge>
                </div>
              )}

              <CardHeader className={plan.popular ? "pt-8" : ""}>
                <CardTitle className="text-foreground">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {plan.description}
                </p>

                {/* Pricing */}
                <div className="mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">
                      {plan.displayPrice}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {plan.period}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* CTA Button */}
                <Button
                  className="w-full"
                  variant={
                    isCurrent ? "outline" : plan.popular ? "default" : "outline"
                  }
                  disabled={isCurrent || loadingPlan === plan.tier}
                  onClick={() => handleUpgrade(plan)}
                >
                  {loadingPlan === plan.tier ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrent ? (
                    "Current Plan"
                  ) : (
                    plan.cta
                  )}
                </Button>

                {/* Features List */}
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Features
                  </p>

                  <div className="space-y-2">
                    {/* Max APIs */}
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {plan.features.max_apis === 0 ||
                        plan.features.max_apis > 50
                          ? "Unlimited"
                          : plan.features.max_apis}{" "}
                        APIs
                      </span>
                    </div>

                    {/* Daily Requests */}
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {formatNumber(plan.features.max_requests_per_day)} daily
                        requests
                      </span>
                    </div>

                    {/* Monthly Requests */}
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {formatNumber(plan.features.max_requests_per_month)}{" "}
                        monthly requests
                      </span>
                    </div>

                    {/* Advanced Analytics */}
                    <div className="flex items-center gap-2">
                      {plan.features.advanced_analytics ? (
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        Advanced Analytics
                      </span>
                    </div>

                    {/* Priority Support */}
                    <div className="flex items-center gap-2">
                      {plan.features.priority_support ? (
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        Priority Support
                      </span>
                    </div>

                    {/* Custom Rate Limits */}
                    <div className="flex items-center gap-2">
                      {plan.features.custom_rate_limits ? (
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        Custom Rate Limits
                      </span>
                    </div>

                    {/* Webhooks */}
                    <div className="flex items-center gap-2">
                      {plan.features.webhooks ? (
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        Webhooks
                      </span>
                    </div>

                    {/* API Access */}
                    <div className="flex items-center gap-2">
                      {plan.features.api_access ? (
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        API Access
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="mt-12">
        <h3 className="text-xl font-bold text-foreground mb-4">
          Detailed Comparison
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-semibold text-foreground">
                  Feature
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.id}
                    className="text-center py-3 px-4 font-semibold text-foreground"
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(featureLabels).map(([key, label]) => (
                <tr
                  key={key}
                  className="border-b border-border hover:bg-muted/50"
                >
                  <td className="py-3 px-4 text-muted-foreground">{label}</td>
                  {plans.map((plan) => (
                    <td
                      key={`${plan.id}-${key}`}
                      className="text-center py-3 px-4"
                    >
                      {typeof plan.features[key as keyof PlanFeatures] ===
                      "boolean" ? (
                        plan.features[key as keyof PlanFeatures] ? (
                          <Check className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-muted-foreground mx-auto" />
                        )
                      ) : (
                        <span className="text-foreground font-medium">
                          {formatNumber(
                            plan.features[key as keyof PlanFeatures] as number
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
