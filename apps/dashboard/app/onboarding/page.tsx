"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  ProgressIndicator,
  Step1Welcome,
  Step2CreateAPI,
  Step3TestAPI,
} from "@/components/onboarding";

interface OnboardingState {
  currentStep: number;
  apiName: string;
  targetUrl: string;
  completed: boolean;
}

const STEPS = ["Welcome", "Create API", "Test & Deploy"];
const STORAGE_KEY = "rateguard_onboarding_state";

export default function OnboardingPage() {
  const router = useRouter();

  // Load saved progress from localStorage
  const [state, setState] = React.useState<OnboardingState>(() => {
    if (typeof window === "undefined")
      return {
        currentStep: 1,
        apiName: "",
        targetUrl: "",
        completed: false,
      };

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Don't restore if already completed
        if (parsed.completed) {
          return {
            currentStep: 1,
            apiName: "",
            targetUrl: "",
            completed: false,
          };
        }
        return parsed;
      }
    } catch (error) {
      console.error("Failed to load onboarding state:", error);
    }

    return {
      currentStep: 1,
      apiName: "",
      targetUrl: "",
      completed: false,
    };
  });

  // Save progress to localStorage whenever state changes
  React.useEffect(() => {
    if (typeof window !== "undefined" && !state.completed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.error("Failed to save onboarding state:", error);
      }
    }
  }, [state]);

  const handleStep1Next = () => {
    setState((prev) => ({ ...prev, currentStep: 2 }));
  };

  const handleStep2Next = (data: { name: string; targetUrl: string }) => {
    setState((prev) => ({
      ...prev,
      currentStep: 3,
      apiName: data.name,
      targetUrl: data.targetUrl,
    }));
  };

  const handleStep3Back = () => {
    setState((prev) => ({ ...prev, currentStep: 2 }));
  };

  const handleStep2Back = () => {
    setState((prev) => ({ ...prev, currentStep: 1 }));
  };

  const handleComplete = () => {
    // Mark as completed
    setState((prev) => ({ ...prev, completed: true }));

    // Clear saved progress
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }

    // Redirect to dashboard
    router.push("/dashboard");
  };

  const handleSkipToDashboard = () => {
    // Clear saved progress
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-background to-muted/30">
      <div className="container max-w-5xl mx-auto px-4 py-8">
        {/* Header with Skip Button */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              RateGuard
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkipToDashboard}
            className="gap-2"
          >
            <X className="size-4" />
            Skip to Dashboard
          </Button>
        </div>

        {/* Progress Indicator */}
        <div className="mb-12">
          <ProgressIndicator
            currentStep={state.currentStep}
            totalSteps={3}
            steps={STEPS}
          />
        </div>

        {/* Step Content */}
        <Card className="border-2 shadow-xl">
          <CardContent className="p-8 md:p-12">
            {state.currentStep === 1 && (
              <Step1Welcome
                onNext={handleStep1Next}
                onSkip={handleSkipToDashboard}
              />
            )}

            {state.currentStep === 2 && (
              <Step2CreateAPI
                onNext={handleStep2Next}
                onBack={handleStep2Back}
                onSkip={handleSkipToDashboard}
              />
            )}

            {state.currentStep === 3 && (
              <Step3TestAPI
                apiName={state.apiName}
                targetUrl={state.targetUrl}
                onBack={handleStep3Back}
                onComplete={handleComplete}
              />
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>
            Your progress is automatically saved. You can return anytime to
            continue.
          </p>
        </div>
      </div>
    </div>
  );
}
