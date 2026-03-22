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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Settings2, ChevronDown, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AdvancedSectionProps {
  timeoutSeconds: number;
  retryAttempts: number;
  corsOrigins: string;
  enabled: boolean;
  onTimeoutChange: (value: number) => void;
  onRetryChange: (value: number) => void;
  onCorsOriginsChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
}

export function AdvancedSection({
  timeoutSeconds,
  retryAttempts,
  corsOrigins,
  enabled,
  onTimeoutChange,
  onRetryChange,
  onCorsOriginsChange,
  onEnabledChange,
}: AdvancedSectionProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const corsOriginsArray = corsOrigins
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <Card className="border-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Settings2 className="size-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Advanced Settings
                    <Badge variant="secondary" className="text-xs">
                      Optional
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {isOpen
                      ? "Configure optional settings"
                      : "Click to expand advanced options"}
                  </CardDescription>
                </div>
              </div>
              <ChevronDown
                className={`size-5 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {/* Timeout */}
            <div className="space-y-2">
              <Label htmlFor="timeout" className="flex items-center gap-2">
                Request Timeout
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Maximum time to wait for a response from your API.
                        Requests taking longer will be terminated.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {timeoutSeconds === 30 && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Recommended
                  </Badge>
                )}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="timeout"
                  type="number"
                  value={timeoutSeconds}
                  onChange={(e) =>
                    onTimeoutChange(parseInt(e.target.value) || 30)
                  }
                  min={5}
                  max={300}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Default: 30 seconds. Range: 5-300 seconds.
              </p>
            </div>

            {/* Retry Attempts */}
            <div className="space-y-2">
              <Label htmlFor="retry" className="flex items-center gap-2">
                Retry Attempts
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Number of times to retry failed requests automatically.
                        0 means no retries.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {retryAttempts === 1 && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Recommended
                  </Badge>
                )}
              </Label>
              <Input
                id="retry"
                type="number"
                value={retryAttempts}
                onChange={(e) => onRetryChange(parseInt(e.target.value) || 0)}
                min={0}
                max={5}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Default: 1 retry. Range: 0-5 retries.
              </p>
            </div>

            {/* CORS Origins */}
            <div className="space-y-2">
              <Label htmlFor="cors-origins" className="flex items-center gap-2">
                Allowed CORS Origins
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Whitelist of domains allowed to make requests to your
                        API. Enter one domain per line. Leave empty to allow all
                        origins.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Textarea
                id="cors-origins"
                placeholder={
                  "https://myapp.com\nhttps://staging.myapp.com\nhttps://localhost:3000"
                }
                value={corsOrigins}
                onChange={(e) => onCorsOriginsChange(e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {corsOriginsArray.length === 0
                  ? "No restrictions - All origins allowed"
                  : `${corsOriginsArray.length} origin${
                      corsOriginsArray.length === 1 ? "" : "s"
                    } whitelisted`}
              </p>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="enabled" className="text-base">
                  API Status
                </Label>
                <p className="text-sm text-muted-foreground">
                  {enabled
                    ? "API is active and accepting requests"
                    : "API is paused - requests will be rejected"}
                </p>
              </div>
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={onEnabledChange}
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
