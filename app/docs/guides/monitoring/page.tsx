import { Metadata } from "next";
import { Activity, Bell, Eye } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Monitoring & Alerts | RateGuard Documentation",
  description: "Set up monitoring and alerts for your APIs.",
};

export default function MonitoringPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Activity className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Monitoring & Alerts
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Sleep soundly knowing RateGuard is watching your API like a hawk. A very caffeinated hawk.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Real-Time Monitoring */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="size-6 text-primary" />
            Real-Time Monitoring
          </h2>
          <p className="text-lg text-muted-foreground">
            Our dashboard updates in real-time. You can watch traffic spikes as they happen, which is surprisingly mesmerizing.
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Traffic Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  See requests per second (RPS) across all your endpoints.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Error Rates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Track 4xx and 5xx errors. Spike in 429s? Someone is hitting their limit. Spike in 500s? Your backend is unhappy.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Alerts */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="size-6 text-primary" />
            Alerts
          </h2>
          <p className="text-lg text-muted-foreground">
            Don't stare at the dashboard all day. Set up alerts and we'll ping you when something happens.
          </p>
          
          <div className="space-y-4">
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Budget Alerts</h3>
              <p className="text-muted-foreground">
                Get notified when you reach 50%, 80%, or 100% of your monthly budget.
                Crucial for preventing surprise bills from OpenAI.
              </p>
            </div>
            
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Error Spikes</h3>
              <p className="text-muted-foreground">
                Trigger an alert if your error rate exceeds a certain threshold (e.g., &gt; 5% for 5 minutes).
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Latency Alerts</h3>
              <p className="text-muted-foreground">
                Know immediately if your API starts slowing down.
              </p>
            </div>
          </div>
        </section>

        {/* Notification Channels */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Notification Channels</h2>
          <p className="text-muted-foreground">
            We can send alerts to wherever you hang out.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li><strong>Email:</strong> The classic.</li>
            <li><strong>Slack:</strong> For when you want your whole team to panic.</li>
            <li><strong>Webhook:</strong> For when you want to trigger a custom remediation script.</li>
          </ul>
        </section>

        <Callout type="default" title="Pro Feature">
          Advanced alerting (Slack integration, custom webhooks) is available on the Pro plan and above.
        </Callout>
      </div>
    </div>
  );
}
