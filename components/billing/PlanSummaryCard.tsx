"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { PlanInfo } from "@/lib/api";
import { useState } from "react";
import { toast } from "sonner";

interface PlanSummaryCardProps {
  plan: PlanInfo;
  onUpgrade: () => void;
  onManage: () => void;
  currency?: string;
}

const planDetails = {
  free: {
    label: "Free Plan",
    price: { USD: "$0/mo", INR: "₹0/mo" },
    description: "Perfect for hobby projects and testing.",
    features: [
      "100K requests/month",
      "3 APIs",
      "100K tokens/month",
      "Basic Analytics",
    ],
    color: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  },
  starter: {
    label: "Starter Plan",
    price: { USD: "$29/mo", INR: "₹499/mo" },
    description: "For growing startups and serious developers.",
    features: [
      "1M requests/month",
      "10 APIs",
      "10M tokens/month",
      "Advanced Analytics",
      "Priority Support",
    ],
    color: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  },
  pro: {
    label: "Pro Plan",
    price: { USD: "$79/mo", INR: "₹1,499/mo" },
    description: "For scaling teams with high volume needs.",
    features: [
      "10M requests/month",
      "Unlimited APIs",
      "100M tokens/month",
      "Advanced Analytics",
      "Dedicated Support",
    ],
    color: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  },
};

export function PlanSummaryCard({
  plan,
  onUpgrade,
  onManage,
  currency = "USD",
}: PlanSummaryCardProps) {
  const currentPlan =
    planDetails[plan.tier as keyof typeof planDetails] || planDetails.free;
  const [isLoading, setIsLoading] = useState(false);

  const displayPrice =
    currentPlan.price[currency as keyof typeof currentPlan.price] ||
    currentPlan.price.USD;

  const handleManage = async () => {
    setIsLoading(true);
    try {
      await onManage();
    } catch (error) {
      console.error(error);
      toast.error("Failed to open billing portal");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <Badge className={`mb-2 ${currentPlan.color}`}>
              {currentPlan.label}
            </Badge>
            <CardTitle className="text-3xl font-bold">{displayPrice}</CardTitle>
            <CardDescription className="mt-1">
              {currentPlan.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">Includes:</p>
          <ul className="space-y-2">
            {currentPlan.features.map((feature, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Check className="h-4 w-4 text-green-500" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 pt-4 border-t">
          {plan.tier === "free" ? (
            <Button
              onClick={onUpgrade}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20"
            >
              Upgrade to Starter
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleManage}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Manage Subscription
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
