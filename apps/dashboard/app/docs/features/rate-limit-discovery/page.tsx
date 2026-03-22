import { Metadata } from "next";
import {
  Search,
  BrainCircuit,
  TrendingUp,
  AlertOctagon,
  Zap,
  BarChart,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Rate Limit Discovery | RateGuard Documentation",
  description:
    "Learn how RateGuard automatically discovers and adapts to upstream rate limits.",
};

export default function RateLimitDiscoveryPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Search className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Rate Limit Discovery
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We learn your upstream limits the hard way, so you don't have to.
              It's like touching a hot stove, but we're a robot, so we don't feel
              pain.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* How It Works */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Adaptive Learning</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We watch for <code>429 Too Many Requests</code> errors from your
            upstream API. When we see one, we back off. We're polite like that.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertOctagon className="size-4 text-red-500" />
                  1. Detection
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We detect a 429 response. We analyze the headers (<code>Retry-After</code>, <code>X-RateLimit-Reset</code>).
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-yellow-500" />
                  2. Adjustment
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We automatically lower our internal limits to match the upstream reality.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="size-4 text-green-500" />
                  3. Recovery
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We slowly ramp back up once the coast is clear. Like merging onto the highway.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Header Parsing */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <BarChart className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Header Intelligence</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We speak fluent "Rate Limit Header". We understand OpenAI, GitHub,
            Twitter, and generic standards.
          </p>

          <CodeTabs
            examples={[
              {
                label: "Standard Headers",
                language: "http",
                code: `HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1699999999
Retry-After: 60`,
              },
              {
                label: "OpenAI Headers",
                language: "http",
                code: `HTTP/1.1 429 Too Many Requests
x-ratelimit-limit-requests: 3500
x-ratelimit-limit-tokens: 90000
x-ratelimit-remaining-requests: 0
x-ratelimit-reset-requests: 20ms`,
              },
            ]}
          />
        </section>

        <Callout type="default" title="Did you know?">
          We can even detect "soft" limits where the API just gets slow before
          it fails. We're like a rate limit whisperer.
        </Callout>

        {/* Configuration */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Configuration</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            You can turn this off if you enjoy getting banned. But we don't
            recommend it.
          </p>

          <CodeTabs
            examples={[
              {
                label: "config.yaml",
                language: "yaml",
                code: `rate_limit_discovery:
  enabled: true
  strategy: "conservative" # or "aggressive"
  parse_headers: true
  decay_factor: 0.5        # Cut rate in half on 429`,
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
