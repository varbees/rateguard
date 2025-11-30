"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Lock, Zap, Save, AlertTriangle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useWebhookConfig,
  useUpdateWebhookConfig,
  useTestWebhookDelivery,
} from "@/lib/hooks/use-webhooks";
import { useUser } from "@/lib/hooks/use-user";
import { toast } from "@/lib/toast";

export function WebhookConfigCard() {
  const { user } = useUser();
  const { data: config, isLoading } = useWebhookConfig();
  const updateConfig = useUpdateWebhookConfig();
  const testDelivery = useTestWebhookDelivery();

  const [destinationUrl, setDestinationUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [retryPolicy, setRetryPolicy] = useState<"auto" | "custom">("auto");
  const [deadLetterAction, setDeadLetterAction] = useState<
    "store" | "discard" | "email"
  >("store");
  const [copied, setCopied] = useState(false);

  // Initialize state from fetched config
  useEffect(() => {
    if (config) {
      setDestinationUrl(config.destination_url || "");
      setEnabled(config.enabled ?? false);
      setRetryPolicy(config.retry_policy || "auto");
      setDeadLetterAction(config.dead_letter_action || "store");
    }
  }, [config]);

  const isPro = user?.plan === "pro" || user?.plan === "enterprise";
  const isEnterprise = user?.plan === "enterprise";

  const handleCopyInbox = () => {
    if (config?.inbox_url) {
      navigator.clipboard.writeText(config.inbox_url);
      setCopied(true);
      toast.success("Inbox URL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
    if (!destinationUrl) {
      toast.error("Destination URL is required");
      return;
    }

    updateConfig.mutate({
      destination_url: destinationUrl,
      enabled,
      retry_policy: retryPolicy,
      dead_letter_action: deadLetterAction,
    });
  };

  const handleTest = () => {
    if (!destinationUrl) return;

    testDelivery.mutate({
      target_url: destinationUrl,
      payload: {
        event: "test.ping",
        timestamp: new Date().toISOString(),
        message: "This is a test webhook from RateGuard",
      },
    });
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 w-1/3 bg-muted rounded mb-2"></div>
          <div className="h-4 w-1/2 bg-muted rounded"></div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Webhook Configuration</CardTitle>
            <CardDescription>
              Configure how you receive and process webhook events.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="enabled-toggle" className="text-sm font-medium">
              {enabled ? "Active" : "Inactive"}
            </Label>
            <Switch
              id="enabled-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Inbox URL */}
        <div className="space-y-2">
          <Label>Webhook Inbox URL</Label>
          <div className="flex gap-2">
            <Input
              value={
                config?.inbox_url ||
                "https://api.rateguard.io/webhook/inbox/wh_..."
              }
              readOnly
              className="font-mono text-sm bg-muted/50"
            />
            <Button variant="outline" size="icon" onClick={handleCopyInbox}>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Send events to this URL to ingest them into RateGuard's relay
            system.
          </p>
        </div>

        {/* Destination URL */}
        <div className="space-y-2">
          <Label>
            Destination URL <span className="text-red-500">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://your-app.com/api/webhooks"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={!destinationUrl || testDelivery.isPending}
            >
              {testDelivery.isPending ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Test
            </Button>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="grid gap-6 md:grid-cols-2 pt-4 border-t">
          {/* Retry Policy */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              Retry Policy
              {!isPro && (
                <Badge variant="outline" className="text-[10px] h-5">
                  <Lock className="w-3 h-3 mr-1" /> Pro
                </Badge>
              )}
            </Label>
            <Select
              value={retryPolicy}
              onValueChange={(val: "auto" | "custom") => setRetryPolicy(val)}
              disabled={!isPro}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Automatic (Exponential Backoff)
                </SelectItem>
                <SelectItem value="custom">Custom Configuration</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {retryPolicy === "auto"
                ? "Retries up to 10 times with increasing delays (1s, 5s, 1m, ...)"
                : "Configure your own retry schedule and max attempts."}
            </p>
          </div>

          {/* Dead Letter Action */}
          <div className="space-y-3">
            <Label>Dead Letter Action</Label>
            <Select
              value={deadLetterAction}
              onValueChange={(val: "store" | "discard" | "email") =>
                setDeadLetterAction(val)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store">Store for Manual Retry</SelectItem>
                <SelectItem value="email">Email Alert & Store</SelectItem>
                <SelectItem value="discard">
                  Discard (Not Recommended)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              What to do when all retry attempts fail.
            </p>
          </div>
        </div>

        {/* Enterprise Signature Secret */}
        {isEnterprise && (
          <div className="space-y-2 pt-4 border-t">
            <Label>Signature Secret</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={config?.signature_secret || "whsec_..."}
                readOnly
                className="font-mono text-sm bg-muted/50"
              />
              <Button variant="outline">Rotate</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used to sign webhook payloads so you can verify they came from
              RateGuard.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between border-t bg-muted/20 px-6 py-4">
        <div className="flex items-center text-sm text-muted-foreground">
          {updateConfig.isPending && (
            <span className="animate-pulse">Saving changes...</span>
          )}
        </div>
        <Button onClick={handleSave} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Configuration
        </Button>
      </CardFooter>
    </Card>
  );
}
