"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Gauge, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RateLimitsSectionProps {
  perSecond: number;
  burst: number;
  perHour: number;
  perDay: number;
  perMonth: number;
  onPerSecondChange: (value: number) => void;
  onBurstChange: (value: number) => void;
  onPerHourChange: (value: number) => void;
  onPerDayChange: (value: number) => void;
  onPerMonthChange: (value: number) => void;
}

interface RateLimitField {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  tooltip: string;
  recommended: number;
  formatValue: (value: number) => string;
}

function formatNumber(num: number | undefined): string {
  if (num === undefined || num === null) return "0";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function RateLimitsSection({
  perSecond,
  burst,
  perHour,
  perDay,
  perMonth,
  onPerSecondChange,
  onBurstChange,
  onPerHourChange,
  onPerDayChange,
  onPerMonthChange,
}: RateLimitsSectionProps) {
  const fields: RateLimitField[] = [
    {
      label: "Per Second",
      value: perSecond,
      onChange: onPerSecondChange,
      min: 1,
      max: 100,
      step: 1,
      unit: "req/sec",
      recommended: 10,
      tooltip:
        "Maximum number of requests allowed per second. This prevents sudden spikes from overwhelming your API.",
      formatValue: (v) => `${v}`,
    },
    {
      label: "Burst",
      value: burst,
      onChange: onBurstChange,
      min: 1,
      max: 200,
      step: 5,
      unit: "requests",
      recommended: 20,
      tooltip:
        "Temporary spike allowance over 10 seconds. Allows brief traffic bursts without triggering rate limits.",
      formatValue: (v) => `${v}`,
    },
    {
      label: "Per Hour",
      value: perHour,
      onChange: onPerHourChange,
      min: 0,
      max: 10000,
      step: 100,
      unit: "req/hour",
      recommended: 1000,
      tooltip:
        "Total requests allowed in a rolling hour window. 0 means unlimited. Useful for controlling hourly quotas.",
      formatValue: (v) => (v === 0 ? "Unlimited" : formatNumber(v)),
    },
    {
      label: "Per Day",
      value: perDay,
      onChange: onPerDayChange,
      min: 0,
      max: 100000,
      step: 1000,
      unit: "req/day",
      recommended: 10000,
      tooltip:
        "Total requests allowed in a rolling 24-hour window. 0 means unlimited. Helps manage daily usage caps.",
      formatValue: (v) => (v === 0 ? "Unlimited" : formatNumber(v)),
    },
    {
      label: "Per Month",
      value: perMonth,
      onChange: onPerMonthChange,
      min: 0,
      max: 1000000,
      step: 10000,
      unit: "req/month",
      recommended: 100000,
      tooltip:
        "Total requests allowed in a rolling 30-day window. 0 means unlimited. Perfect for monthly billing cycles.",
      formatValue: (v) => (v === 0 ? "Unlimited" : formatNumber(v)),
    },
  ];

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gauge className="size-5 text-primary" />
          </div>
          Rate Limits
          <Badge variant="secondary" className="text-xs">
            Visual Controls
          </Badge>
        </CardTitle>
        <CardDescription>
          Control how many requests your API can handle. Adjust sliders to set
          limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {fields.map((field) => (
          <div key={field.label} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                {field.label}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">{field.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {field.value === field.recommended && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Recommended
                  </Badge>
                )}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={field.value ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    field.onChange(
                      Math.max(field.min, Math.min(field.max, val))
                    );
                  }}
                  className="w-24 h-8 text-right"
                  min={field.min}
                  max={field.max}
                />
                <span className="text-sm text-muted-foreground min-w-[80px]">
                  {field.unit}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-8">
                {field.min}
              </span>
              <Slider
                value={[field.value]}
                onValueChange={(values) => field.onChange(values[0])}
                min={field.min}
                max={field.max}
                step={field.step}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-12 text-right">
                {field.formatValue(field.max)}
              </span>
            </div>

            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <span className="font-medium">Current setting:</span>{" "}
              <span className="text-foreground font-semibold">
                {field.formatValue(field.value)} {field.unit}
              </span>
            </div>
          </div>
        ))}

        {/* Plain English Summary */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            What this means in plain English:
          </h4>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <li>
              • Your API will accept up to{" "}
              <strong>{perSecond} requests per second</strong>
            </li>
            <li>
              • Short traffic spikes up to <strong>{burst} requests</strong> are
              allowed
            </li>
            <li>
              •{" "}
              {perHour === 0 ? (
                <strong>No hourly limit</strong>
              ) : (
                <>
                  Maximum of{" "}
                  <strong>{formatNumber(perHour)} requests per hour</strong>
                </>
              )}
            </li>
            <li>
              •{" "}
              {perDay === 0 ? (
                <strong>No daily limit</strong>
              ) : (
                <>
                  Maximum of{" "}
                  <strong>{formatNumber(perDay)} requests per day</strong>
                </>
              )}
            </li>
            <li>
              •{" "}
              {perMonth === 0 ? (
                <strong>No monthly limit</strong>
              ) : (
                <>
                  Maximum of{" "}
                  <strong>{formatNumber(perMonth)} requests per month</strong>
                </>
              )}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
