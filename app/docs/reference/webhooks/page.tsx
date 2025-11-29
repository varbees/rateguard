import { Metadata } from "next";
import { Webhook } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { CodeTabs } from "@/components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Webhook Schema | RateGuard Documentation",
  description: "Technical reference for RateGuard webhooks.",
};

export default function WebhookSchemaPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Webhook className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Webhook Schema
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Don&apos;t call us, we&apos;ll call you. Here&apos;s what we&apos;ll say.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Event Structure */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Event Structure</h2>
          <p className="text-muted-foreground">
            Every webhook event shares a common envelope structure.
          </p>
          
          <CodeTabs
            examples={[
              {
                label: "JSON",
                language: "json",
                code: `{
  "id": "evt_1234567890",
  "type": "budget.threshold_reached",
  "created_at": "2023-01-01T12:00:00Z",
  "data": {
    // Event-specific data
  }
}`,
              },
            ]}
          />
        </section>

        {/* Event Types */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Event Types</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-2 font-mono">budget.threshold_reached</h3>
              <p className="text-muted-foreground mb-4">
                Fired when a user reaches a configured budget percentage (50%, 80%, 100%).
              </p>
              <CodeTabs
                examples={[
                  {
                    label: "Payload",
                    language: "json",
                    code: `{
  "threshold": 80,
  "current_spend": 80.50,
  "limit": 100.00,
  "currency": "USD"
}`,
                  },
                ]}
              />
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2 font-mono">rate_limit.breached</h3>
              <p className="text-muted-foreground mb-4">
                Fired when a user is rate-limited (429). Useful for detecting abuse.
              </p>
              <CodeTabs
                examples={[
                  {
                    label: "Payload",
                    language: "json",
                    code: `{
  "ip": "192.168.1.1",
  "user_id": "user_123",
  "endpoint": "/proxy/openai/v1/chat/completions",
  "limit": 100,
  "window": 60
}`,
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Security</h2>
          <p className="text-muted-foreground">
            Verify that the webhook actually came from us. We sign every request with a secret.
          </p>
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <p className="mb-2"><strong>Header:</strong> `X-RG-Signature`</p>
              <p><strong>Algorithm:</strong> HMAC-SHA256</p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
