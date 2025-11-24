import * as React from "react";
import { Metadata } from "next";
import {
  Zap,
  Layers,
  Clock,
  Calendar,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Activity,
  Timer,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { RateLimitVisualizer } from "@/components/docs/RateLimitVisualizer";
import { RetryLogicDemo } from "@/components/docs/RetryLogicDemo";
import {
  configureRateLimitsExamples,
  readHeadersExamples,
  exponentialBackoffExamples,
  handle429Examples,
  perUserTrackingExamples,
} from "@/lib/docs/rate-limit-examples";

export const metadata: Metadata = {
  title: "Multi-Tier Rate Limiting | RateGuard Documentation",
  description:
    "Comprehensive guide to RateGuard's 5-tier rate limiting system with interactive visualizations and code examples.",
};

export default function RateLimitingGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-linear-to-b from-muted/50 to-background">
        <div className="container max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Layers className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Multi-Tier Rate Limiting
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Understand RateGuard&apos;s sophisticated 5-tier rate limiting
                system and learn best practices for handling rate limits in your
                applications.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            {[
              {
                icon: Zap,
                color: "text-chart-1",
                name: "Per Second",
                desc: "Fast requests, resets every second",
              },
              {
                icon: Layers,
                color: "text-chart-2",
                name: "Burst",
                desc: "Handle traffic spikes gracefully",
              },
              {
                icon: Clock,
                color: "text-primary",
                name: "Per Hour",
                desc: "Medium-term quota management",
              },
              {
                icon: Calendar,
                color: "text-chart-3",
                name: "Per Day/Month",
                desc: "Long-term usage limits",
              },
            ].map((tier) => (
              <Card key={tier.name} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <tier.icon className={`size-4 ${tier.color}`} />
                    <CardTitle className="text-sm">{tier.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{tier.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* Overview */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Shield className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Overview</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            RateGuard implements a sophisticated 5-tier rate limiting system
            that protects your APIs from abuse while providing flexibility for
            legitimate traffic patterns. Each tier operates independently and
            all tiers are checked simultaneously for every request.
          </p>

          <Callout type="default" title="All Tiers Checked Simultaneously">
            When a request arrives, RateGuard checks{" "}
            <strong>all 5 tiers</strong> using Redis for distributed rate
            limiting. If any single tier is exceeded, the request is rejected
            with a <code className="text-sm">429 Too Many Requests</code>{" "}
            response.
          </Callout>

          <Callout type="warning" title="Implementation Details">
            This simulator represents the{" "}
            <strong>Redis-based multi-tier system</strong> used in production.
            RateGuard also has a fallback token bucket limiter (RPS + burst
            only) that activates when Redis is unavailable. The multi-tier
            system requires Redis to be properly configured and connected.
          </Callout>
        </section>

        {/* Interactive Visualizer */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Activity className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Interactive Visualization</h2>
          </div>
          <RateLimitVisualizer />
        </section>

        {/* Configuration */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Code2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Configuring Rate Limits</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Configure rate limits for your API endpoints using a single API
            call. Each tier can be customized independently to match your
            application&apos;s needs.
          </p>

          <CodeTabs
            examples={configureRateLimitsExamples.examples}
            defaultLanguage="javascript"
          />
        </section>

        {/* Monitoring Headers */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Activity className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">
              Monitoring Rate Limit Headers
            </h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Every API response includes detailed rate limit headers for all
            tiers. Use these headers to track usage and implement client-side
            throttling.
          </p>

          <CodeTabs
            examples={readHeadersExamples.examples}
            defaultLanguage="typescript"
          />
        </section>

        {/* Interactive Retry Demo */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Timer className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Retry Strategies</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            When you receive a 429 response, implement an appropriate retry
            strategy. Exponential backoff is recommended for most use cases.
          </p>

          <RetryLogicDemo />
        </section>

        {/* Exponential Backoff */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Code2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">
              Implementing Exponential Backoff
            </h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Exponential backoff doubles the wait time between retries,
            preventing request storms and giving the rate limiter time to reset.
          </p>

          <CodeTabs
            examples={exponentialBackoffExamples.examples}
            defaultLanguage="typescript"
          />

          <Callout type="success" title="Best Practice">
            Always respect the <code className="text-sm">Retry-After</code>{" "}
            header if present. This tells you exactly when you can retry the
            request without being rate limited again.
          </Callout>
        </section>

        {/* Handle 429 */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Handling 429 Responses</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            When a rate limit is exceeded, RateGuard returns a 429 status code
            with detailed information about the limit that was exceeded.
          </p>

          <CodeTabs
            examples={handle429Examples.examples}
            defaultLanguage="typescript"
          />
        </section>

        {/* Per-User Tracking */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Activity className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Per-User Rate Limit Tracking</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Track rate limits on a per-user basis to provide better UX and
            prevent one user&apos;s rate limit from affecting others.
          </p>

          <CodeTabs
            examples={perUserTrackingExamples.examples}
            defaultLanguage="typescript"
          />
        </section>

        {/* Best Practices */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Best Practices</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <CheckCircle2 className="size-5" />
                  Do
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {[
                    "Monitor rate limit headers and throttle requests proactively",
                    "Implement exponential backoff with jitter",
                    "Respect the Retry-After header",
                    "Cache API responses when appropriate",
                    "Batch requests when possible",
                    "Log 429 errors for monitoring",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5" />
                  Don&apos;t
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {[
                    "Retry immediately without backoff",
                    "Ignore rate limit headers",
                    "Retry more than 5 times",
                    "Make parallel requests without coordination",
                    "Hide rate limit errors from users",
                    "Set limits too high without monitoring",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
