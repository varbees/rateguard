"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Info, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BasicInfoSectionProps {
  name: string;
  targetUrl: string;
  description: string;
  onNameChange: (value: string) => void;
  onTargetUrlChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  errors?: {
    name?: string;
    targetUrl?: string;
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function BasicInfoSection({
  name,
  targetUrl,
  description,
  onNameChange,
  onTargetUrlChange,
  onDescriptionChange,
  errors,
}: BasicInfoSectionProps) {
  const [nameBlurred, setNameBlurred] = React.useState(false);
  const [urlBlurred, setUrlBlurred] = React.useState(false);

  const slugifiedName = slugify(name);
  const isNameValid = slugifiedName.length >= 3;
  const isUrlValid = targetUrl.length === 0 || isValidUrl(targetUrl);

  const showNameError = nameBlurred && !isNameValid && name.length > 0;
  const showUrlError = urlBlurred && !isUrlValid && targetUrl.length > 0;

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Info className="size-5 text-primary" />
          </div>
          Basic Information
        </CardTitle>
        <CardDescription>
          Essential details about your API endpoint
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API Name */}
        <div className="space-y-2">
          <Label htmlFor="api-name" className="flex items-center gap-2">
            API Name
            <span className="text-destructive">*</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    A unique identifier for your API. Will be auto-converted to
                    lowercase with hyphens (e.g., &quot;My API&quot; becomes
                    &quot;my-api&quot;)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <div className="relative">
            <Input
              id="api-name"
              placeholder="e.g., stripe-api, github-api"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={() => setNameBlurred(true)}
              className={
                showNameError || errors?.name ? "border-destructive" : ""
              }
            />
            {name && isNameValid && !errors?.name && (
              <CheckCircle2 className="absolute right-3 top-3 size-4 text-green-600" />
            )}
            {(showNameError || errors?.name) && (
              <AlertCircle className="absolute right-3 top-3 size-4 text-destructive" />
            )}
          </div>
          {slugifiedName && slugifiedName !== name && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Will be saved as:</span>
              <code className="px-2 py-0.5 rounded bg-muted font-mono">
                {slugifiedName}
              </code>
            </div>
          )}
          {(showNameError || errors?.name) && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              {errors?.name || "API name must be at least 3 characters"}
            </p>
          )}
        </div>

        {/* Target URL */}
        <div className="space-y-2">
          <Label htmlFor="target-url" className="flex items-center gap-2">
            Target API URL
            <span className="text-destructive">*</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    The base URL of the API you want to protect. All requests
                    will be proxied to this URL with rate limiting applied.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <div className="relative">
            <Input
              id="target-url"
              type="url"
              placeholder="https://api.example.com"
              value={targetUrl}
              onChange={(e) => onTargetUrlChange(e.target.value)}
              onBlur={() => setUrlBlurred(true)}
              className={
                showUrlError || errors?.targetUrl ? "border-destructive" : ""
              }
            />
            {targetUrl && isUrlValid && !errors?.targetUrl && (
              <CheckCircle2 className="absolute right-3 top-3 size-4 text-green-600" />
            )}
            {(showUrlError || errors?.targetUrl) && (
              <AlertCircle className="absolute right-3 top-3 size-4 text-destructive" />
            )}
          </div>
          {(showUrlError || errors?.targetUrl) && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              {errors?.targetUrl ||
                "Please enter a valid URL (must start with http:// or https://)"}
            </p>
          )}
        </div>

        {/* Description (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="description" className="flex items-center gap-2">
            Description
            <Badge variant="secondary" className="text-xs">
              Optional
            </Badge>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    A brief description to help you remember what this API is
                    for. Only visible to you.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Textarea
            id="description"
            placeholder="e.g., Stripe payment processing API for checkout flow"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {description.length}/500 characters
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
