"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { webhookAPI, type WebhookInboxRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Webhook, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const WEBHOOK_TEMPLATES = {
  stripe: {
    source: "stripe",
    event_type: "payment_intent.succeeded",
    payload: {
      id: "pi_test_123",
      object: "payment_intent",
      amount: 2000,
      currency: "usd",
      status: "succeeded",
    },
  },
  github: {
    source: "github",
    event_type: "push",
    payload: {
      ref: "refs/heads/main",
      repository: {
        name: "test-repo",
        full_name: "user/test-repo",
      },
      pusher: {
        name: "testuser",
      },
    },
  },
  custom: {
    source: "custom",
    event_type: "test.event",
    payload: {
      message: "Hello, World!",
      timestamp: new Date().toISOString(),
    },
  },
};

export function CreateTestWebhook() {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<keyof typeof WEBHOOK_TEMPLATES>("custom");
  const [targetUrl, setTargetUrl] = useState("https://webhook.site/unique-id");
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(WEBHOOK_TEMPLATES.custom.payload, null, 2)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleTemplateChange = (value: keyof typeof WEBHOOK_TEMPLATES) => {
    setTemplate(value);
    const selectedTemplate = WEBHOOK_TEMPLATES[value];
    setPayloadText(JSON.stringify(selectedTemplate.payload, null, 2));
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Webhook URL copied to clipboard",
    });
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      // Parse payload
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(payloadText);
      } catch (e) {
        toast({
          title: "Invalid JSON",
          description: "Please check your payload syntax",
          variant: "destructive",
        });
        return;
      }

      const selectedTemplate = WEBHOOK_TEMPLATES[template];
      const data: WebhookInboxRequest = {
        source: selectedTemplate.source,
        event_type: selectedTemplate.event_type,
        payload,
        target_url: targetUrl,
      };

      await webhookAPI.create(data);

      toast({
        title: "Webhook Created",
        description: "Test webhook has been queued for delivery",
      });

      // Refresh webhook events list
      queryClient.invalidateQueries({ queryKey: ["webhook-events"] });
      queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });

      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Failed to Create Webhook",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Webhook className="h-4 w-4 mr-2" />
          Create Test Webhook
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Test Webhook</DialogTitle>
          <DialogDescription>
            Send a test webhook event to verify your integration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label htmlFor="template">Template</Label>
            <Select value={template} onValueChange={handleTemplateChange}>
              <SelectTrigger id="template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe Payment</SelectItem>
                <SelectItem value="github">GitHub Push</SelectItem>
                <SelectItem value="custom">Custom Event</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Target URL */}
          <div className="space-y-2">
            <Label htmlFor="target-url">Target URL</Label>
            <div className="flex gap-2">
              <Input
                id="target-url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://your-endpoint.com/webhook"
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyUrl}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use{" "}
              <a
                href="https://webhook.site"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                webhook.site
              </a>{" "}
              to create a test endpoint
            </p>
          </div>

          {/* Payload Editor */}
          <div className="space-y-2">
            <Label htmlFor="payload">Payload (JSON)</Label>
            <Textarea
              id="payload"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="font-mono text-sm min-h-[200px]"
              placeholder='{"key": "value"}'
            />
          </div>

          {/* Info Card */}
          <Card className="p-4 bg-muted/50">
            <div className="flex gap-3">
              <Webhook className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium">How it works</p>
                <p className="text-muted-foreground">
                  This will create a webhook event that will be delivered to your target URL.
                  You can track the delivery status in the events list below.
                </p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Test Webhook
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
