"use client";

import { useState } from "react";
import { Check, Copy, Info, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCreateWebhookEvent } from "@/lib/hooks/use-webhooks";
import { toast } from "@/lib/toast";

const defaultPayload = JSON.stringify(
  {
    event: "demo.created",
    message: "Hello from RateGuard",
    timestamp: new Date().toISOString(),
  },
  null,
  2
);

export function WebhookConfigCard() {
  const createEvent = useCreateWebhookEvent();
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState("demo-app");
  const [eventType, setEventType] = useState("demo.created");
  const [targetUrl, setTargetUrl] = useState("https://example.com/webhooks");
  const [payload, setPayload] = useState(defaultPayload);
  const [headersJson, setHeadersJson] = useState("{}");

  const inboxUrl = `${
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008"
  }/api/v1/webhook/inbox`;

  const handleCopyInbox = async () => {
    try {
      await navigator.clipboard.writeText(inboxUrl);
      setCopied(true);
      toast.success("Inbox URL copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy inbox URL");
    }
  };

  const handleSend = () => {
    let parsedPayload: Record<string, unknown>;
    let parsedHeaders: Record<string, string> | undefined;

    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      toast.error("Payload must be valid JSON");
      return;
    }

    if (headersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(headersJson);
      } catch {
        toast.error("Headers must be valid JSON");
        return;
      }
    }

    createEvent.mutate({
      source: source.trim(),
      event_type: eventType.trim(),
      payload: parsedPayload,
      target_url: targetUrl.trim(),
      headers: parsedHeaders,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook Inbox</CardTitle>
        <CardDescription>
          The backend currently exposes inbox, status, event details, and replay. Use this panel to send a sample inbound event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            There is no live webhook configuration endpoint yet, so this card stays honest and exercises the real inbox route.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label>Webhook Inbox URL</Label>
          <div className="flex gap-2">
            <Input value={inboxUrl} readOnly className="font-mono text-sm bg-muted/50" />
            <Button variant="outline" size="icon" onClick={handleCopyInbox}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This is the real authenticated endpoint used to ingest webhook events into the relay.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Input
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="stripe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-type">Event Type</Label>
            <Input
              id="event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="payment.succeeded"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="target-url">Target URL</Label>
          <Input
            id="target-url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com/webhooks"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="payload">Payload JSON</Label>
          <Textarea
            id="payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="min-h-40 font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="headers">Headers JSON optional</Label>
          <Textarea
            id="headers"
            value={headersJson}
            onChange={(e) => setHeadersJson(e.target.value)}
            className="min-h-24 font-mono text-sm"
          />
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3 border-t px-6 py-4">
        <p className="text-xs text-muted-foreground">
          Events created here will appear in the table below once accepted by the backend.
        </p>
        <Button onClick={handleSend} disabled={createEvent.isPending}>
          {createEvent.isPending ? (
            <>
              <Send className="mr-2 h-4 w-4 animate-pulse" />
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send Sample Event
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
