import { Metadata } from "next";
import { Plug, Slack, Webhook } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Third Party Tools | RateGuard Documentation",
  description: "Integrate RateGuard with Slack, Discord, and more.",
};

export default function ThirdPartyToolsPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Plug className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Third Party Tools
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Connect RateGuard to the tools you already use.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Slack */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Slack className="size-6 text-primary" />
            Slack
          </h2>
          <p className="text-muted-foreground">
            Get alerts directly in your team&apos;s Slack channel.
          </p>
          <Card>
            <CardHeader>
              <CardTitle>Supported Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-4 space-y-2 text-muted-foreground">
                <li>Budget thresholds (50%, 80%, 100%)</li>
                <li>Error rate spikes</li>
                <li>New API key creation</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Webhooks */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="size-6 text-primary" />
            Custom Webhooks
          </h2>
          <p className="text-muted-foreground">
            Send events to any URL. Perfect for Zapier, PagerDuty, or your own internal dashboard.
          </p>
          <Callout type="default" title="Payload Format">
            We send a standard JSON payload with every event. Check the <a href="/docs/reference/webhooks" className="text-primary hover:underline">Webhook Reference</a> for details.
          </Callout>
        </section>
      </div>
    </div>
  );
}
