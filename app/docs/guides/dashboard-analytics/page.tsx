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
  description: "Master the RateGuard dashboard and analytics.",
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
              Data is beautiful. Especially when it tells you your API is working perfectly.
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
            You can see requests, errors, latency, and token usage all in one place.
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
                  Watch requests come in live. It's like The Matrix, but with less leather and more JSON.
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
                  See exactly how many tokens each model is consuming. Identify your most expensive users.
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
                  Track P50, P90, and P99 latency. Find out if OpenAI is slow or if it's just you. (It's usually OpenAI).
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
                  Monitor 4xx and 5xx errors. Set up alerts to get notified when things go south.
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
                Great for debugging why that one user keeps getting a 400 Bad Request.
              </p>
            </div>
            
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Usage by Consumer</h3>
              <p className="text-muted-foreground">
                Drill down into usage by specific API keys or user IDs.
                Perfect for figuring out who to upsell to your Enterprise plan.
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">Cost Estimation</h3>
              <p className="text-muted-foreground">
                We estimate the cost of your LLM usage based on public pricing.
                No more surprises at the end of the month.
              </p>
            </div>
          </div>
        </section>

        <Callout type="warning" title="Data Retention">
          Data retention depends on your plan. Free plans get 24 hours, while Enterprise plans get up to 90 days.
          If you need more, you can export your data via our Analytics API.
        </Callout>
      </div>
    </div>
  );
}
