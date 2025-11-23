"use client";

import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  steps,
}: ProgressIndicatorProps) {
  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="w-full space-y-4">
      {/* Progress Bar */}
      <Progress value={progress} className="h-2" />

      {/* Step Indicators */}
      <div className="flex justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div
              key={stepNumber}
              className={cn(
                "flex flex-col items-center gap-2 flex-1",
                index < steps.length - 1 && "relative"
              )}
            >
              <div className="flex items-center gap-2">
                {isCompleted ? (
                  <CheckCircle2 className="size-6 text-green-600" />
                ) : (
                  <Circle
                    className={cn(
                      "size-6",
                      isCurrent
                        ? "text-primary fill-primary/20"
                        : "text-muted-foreground"
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium text-center",
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
