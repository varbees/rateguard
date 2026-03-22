"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface APITemplate {
  name: string;
  displayName: string;
  targetUrl: string;
  description: string;
  icon: string;
}

const templates: APITemplate[] = [
  {
    name: "stripe-api",
    displayName: "Stripe",
    targetUrl: "https://api.stripe.com/v1",
    description: "Payment processing",
    icon: "💳",
  },
  {
    name: "openai-api",
    displayName: "OpenAI",
    targetUrl: "https://api.openai.com/v1",
    description: "AI & Machine Learning",
    icon: "🤖",
  },
  {
    name: "github-api",
    displayName: "GitHub",
    targetUrl: "https://api.github.com",
    description: "Version control",
    icon: "🐙",
  },
];

interface Step2CreateAPIProps {
  onNext: (data: { name: string; targetUrl: string }) => void;
  onBack: () => void;
  onSkip: () => void;
}

export function Step2CreateAPI({
  onNext,
  onBack,
  onSkip,
}: Step2CreateAPIProps) {
  const [name, setName] = React.useState("");
  const [targetUrl, setTargetUrl] = React.useState("");
  const [error, setError] = React.useState("");

  const handleTemplateSelect = (template: APITemplate) => {
    setName(template.name);
    setTargetUrl(template.targetUrl);
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      setError("API name is required");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      setError("API name must be lowercase with hyphens only");
      return;
    }

    if (!targetUrl.trim()) {
      setError("Target URL is required");
      return;
    }

    try {
      new URL(targetUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    onNext({ name: name.trim(), targetUrl: targetUrl.trim() });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h2 className="text-3xl font-bold">Create Your First API</h2>
        <p className="text-muted-foreground">
          Choose a template or configure manually. We&apos;ll set smart defaults
          for you.
        </p>
      </motion.div>

      {/* Templates */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Label className="mb-3 block">Quick Start Templates</Label>
        <div className="grid md:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card
              key={template.name}
              className="cursor-pointer hover:border-primary transition-all hover:shadow-md"
              onClick={() => handleTemplateSelect(template)}
            >
              <CardContent className="p-4 text-center space-y-2">
                <div className="text-4xl">{template.icon}</div>
                <div>
                  <div className="font-semibold">{template.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {template.description}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Configure your API endpoint with smart defaults
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* API Name */}
            <div className="space-y-2">
              <Label htmlFor="api-name">
                API Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="api-name"
                placeholder="e.g., stripe-api, github-api"
                value={name}
                onChange={(e) => {
                  setName(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                  );
                  setError("");
                }}
                className={error && !name ? "border-destructive" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>

            {/* Target URL */}
            <div className="space-y-2">
              <Label htmlFor="target-url">
                Target URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="target-url"
                type="url"
                placeholder="https://api.example.com"
                value={targetUrl}
                onChange={(e) => {
                  setTargetUrl(e.target.value);
                  setError("");
                }}
                className={error && !targetUrl ? "border-destructive" : ""}
              />
              <p className="text-xs text-muted-foreground">
                The API endpoint you want to protect
              </p>
            </div>

            {/* Smart Defaults Info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-primary" />
                Smart Defaults Applied
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Rate Limit</div>
                  <Badge variant="secondary">10 req/sec</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Burst Size</div>
                  <Badge variant="secondary">20 requests</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Timeout</div>
                  <Badge variant="secondary">30 seconds</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Retries</div>
                  <Badge variant="secondary">0</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                You can customize these later in the dashboard
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="gap-2"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <div className="flex gap-4">
            <Button type="button" variant="ghost" onClick={onSkip}>
              Skip
            </Button>
            <Button type="submit" className="gap-2">
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
