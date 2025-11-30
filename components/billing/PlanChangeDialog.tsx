"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PlanChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanId: string;
  onPlanChange: (planId: string) => Promise<void>;
}

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/mo",
    features: ["100K req/month", "3 APIs", "100K tokens/month"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$29",
    period: "/mo",
    features: ["1M req/month", "10 APIs", "10M tokens/month"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$79",
    period: "/mo",
    features: ["10M req/month", "Unlimited APIs", "100M tokens/month"],
  },
];

export function PlanChangeDialog({
  open,
  onOpenChange,
  currentPlanId,
  onPlanChange,
}: PlanChangeDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlanId);
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (selectedPlan === currentPlanId) {
      onOpenChange(false);
      return;
    }

    setIsLoading(true);
    try {
      await onPlanChange(selectedPlan);
      // For paid plans, we redirect to checkout, so don't show success toast immediately
      if (selectedPlan === "free") {
        toast.success(
          `Successfully changed plan to ${
            plans.find((p) => p.id === selectedPlan)?.name
          }`
        );
        onOpenChange(false);
      } else {
        toast.info("Redirecting to secure checkout...");
        // Keep dialog open with loading state until redirect happens
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to initiate plan change. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Change Plan</DialogTitle>
          <DialogDescription>
            Choose the plan that best fits your needs. Changes take effect
            immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={selectedPlan}
            onValueChange={setSelectedPlan}
            className="grid gap-4"
            aria-label="Select a plan"
          >
            {plans.map((plan) => (
              <div key={plan.id}>
                <RadioGroupItem
                  value={plan.id}
                  id={plan.id}
                  className="peer sr-only"
                  aria-labelledby={`plan-name-${plan.id}`}
                />
                <Label
                  htmlFor={plan.id}
                  className="flex flex-col md:flex-row md:items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        id={`plan-name-${plan.id}`}
                        className="font-semibold text-lg"
                      >
                        {plan.name}
                      </span>
                      {currentPlanId === plan.id && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-2">
                      {plan.features.map((f, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <Check className="h-3 w-3" /> {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 md:mt-0 md:text-right">
                    <span className="text-xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || selectedPlan === currentPlanId}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedPlan === "free" ? "Confirm Change" : "Proceed to Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
