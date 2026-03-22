import { Metadata } from "next";
import { BarChart, Activity, PieChart, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Dashboard & Analytics | RateGuard Documentation",
  description: "Read the RateGuard dashboard and analytics without guessing at the workflow.",
};

export default function DashboardAnalyticsPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <BarChart className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Dashboard & Analytics
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              The dashboard is where the operating story becomes visible.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Overview */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Overview</h2>
          <p className="text-lg text-muted-foreground">
            The RateGuard dashboard gives you a real-time view of your API traffic.
            You can see requests, errors, latency, and token usage in one place.
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-5 text-primary" />
                  Real-Time Traffic
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Watch requests come in live and confirm the control plane is doing its job.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="size-5 text-primary" />
                  Token Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  See how token usage is distributed across models and consumers.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="size-5 text-primary" />
                  Latency Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Track P50, P90, and P99 latency so you can separate model latency from your own overhead.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart className="size-5 text-primary" />
                  Error Rates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Monitor 4xx and 5xx errors and set up alerts before the issue becomes visible to users.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Key Features */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Key Features</h2>
          
          <div className="space-y-4">
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Live Request Log</h3>
              <p className="text-muted-foreground">
                Inspect individual requests. See headers, bodies (if enabled), and response times.
                Useful when one request path keeps behaving differently than the others.
              </p>
            </div>
            
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Usage by Consumer</h3>
              <p className="text-muted-foreground">
                Drill down into usage by specific API keys or user IDs.
                Useful for spotting heavy consumers and adjusting guardrails.
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Cost Estimation</h3>
              <p className="text-muted-foreground">
                We estimate usage cost from the model rates you provide or publish.
                No surprises, just visibility.
              </p>
            </div>
          </div>
        </section>

        <Callout type="warning" title="Data Retention">
          Data retention is controlled by your deployment and storage settings. If you need a longer history, export your data via the Analytics API.
        </Callout>
      </div>
    </div>
  );
}
