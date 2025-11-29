import { Metadata } from "next";
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  ZapOff,
  Timer,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Circuit Breaker | RateGuard Documentation",
  description:
    "Protect your system from cascading failures with RateGuard's automatic circuit breaker.",
};

export default function CircuitBreakerPage() {
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
              Circuit Breaker
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Sometimes things break. Like the ice cream machine at McDonald's,
              or Ryan starting a fire with a cheese pita. We stop the fire from
              spreading.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* How It Works */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">The Safety Mechanism</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            When your upstream service starts failing, we stop sending requests.
            It gives the service time to recover, like a timeout for a toddler
            (or Andy Bernard).
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border-l-4 border-l-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="size-4 text-green-500" />
                  Closed (Normal)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Traffic flows normally. Everyone is happy. Pretzel day is
                happening.
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ZapOff className="size-4 text-red-500" />
                  Open (Broken)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Too many errors. We cut the power. No requests go through. Immediate failure.
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Timer className="size-4 text-yellow-500" />
                  Half-Open (Testing)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We let a few requests through to test the waters. If they work, we're back in business.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Configuration */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Configuration</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Tune the sensitivity. Do you want a hair-trigger like Dwight, or a
            relaxed approach like Jim?
          </p>

          <CodeTabs
            examples={[
              {
                label: "YAML Config",
                language: "yaml",
                code: `circuit_breaker:
  enabled: true
  threshold: 50        # Fail after 50 errors
  window: 10s          # ...in 10 seconds
  reset_timeout: 30s   # Wait 30s before trying again
  min_requests: 10     # Need at least 10 requests to trigger`,
              },
              {
                label: "JSON Config",
                language: "json",
                code: `{
  "circuit_breaker": {
    "enabled": true,
    "threshold": 50,
    "window": "10s",
    "reset_timeout": "30s",
    "min_requests": 10
  }
}`,
              },
            ]}
          />
        </section>

        <Callout type="danger" title="Warning">
          If you set the threshold too low, you might trigger the circuit breaker
          just because the intern tripped over a cable. Use with caution.
        </Callout>

        {/* Error Responses */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">What Clients See</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            When the circuit is open, we return a <code>503 Service Unavailable</code>.
            It's our way of saying "It's not you, it's us (well, actually it's the upstream service)."
          </p>

          <div className="p-4 bg-muted/50 rounded-lg border font-mono text-sm">
            <div className="text-muted-foreground mb-2">HTTP/1.1 503 Service Unavailable</div>
            <div className="text-muted-foreground">Retry-After: 30</div>
            <div className="mt-4 text-primary">
              {`{
  "error": "circuit_breaker_open",
  "message": "Upstream service is unhealthy. Please try again later.",
  "retry_after": 30
}`}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
