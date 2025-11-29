import { Metadata } from "next";
import {
  BookOpen,
  Shield,
  Zap,
  Scale,
  AlertTriangle,
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
  title: "Rate Limiting Guide | RateGuard Documentation",
  description:
    "A comprehensive guide to rate limiting strategies and best practices.",
};

export default function RateLimitingGuidePage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <BookOpen className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Rate Limiting Guide
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Everything you wanted to know about rate limiting but were afraid
              to ask. Or maybe you just didn't care until your server crashed.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Why Rate Limit? */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Why Do We Need This?</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Because the internet is a dark and scary place full of bots, scrapers,
            and people who think "F5" is a gameplay mechanic.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="size-4 text-primary" />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Prevent DoS attacks and brute force attempts. Keep the bad guys out.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Scale className="size-4 text-primary" />
                  Fairness
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Ensure one user doesn't hog all the resources. Sharing is caring.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="size-4 text-primary" />
                  Stability
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Prevent cascading failures when load spikes. Keep the lights on.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Algorithms */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Algorithms Explained</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We support multiple algorithms. Here's the breakdown.
          </p>

          <div className="space-y-6">
            <div className="border rounded-lg p-6">
              <h3 className="text-xl font-bold mb-2">Token Bucket</h3>
              <p className="text-muted-foreground mb-4">
                Imagine a bucket. Tokens drip in at a constant rate. You need a
                token to make a request. If the bucket is empty, you wait. Good
                for allowing bursts.
              </p>
              <Badge>Best for APIs</Badge>
            </div>

            <div className="border rounded-lg p-6">
              <h3 className="text-xl font-bold mb-2">Leaky Bucket</h3>
              <p className="text-muted-foreground mb-4">
                Requests enter a bucket and leak out at a constant rate. If the
                bucket overflows, requests are dropped. Good for smoothing traffic.
              </p>
              <Badge variant="secondary">Best for Packet Switching</Badge>
            </div>

            <div className="border rounded-lg p-6">
              <h3 className="text-xl font-bold mb-2">Fixed Window</h3>
              <p className="text-muted-foreground mb-4">
                "100 requests per minute." Simple. But you can get a burst at the
                edge of the window (e.g., 100 at 12:00:59 and 100 at 12:01:01).
              </p>
              <Badge variant="outline">Simple & Fast</Badge>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Best Practices</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Don't be that guy. Follow the rules.
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Use Exponential Backoff</h4>
                <p className="text-sm text-muted-foreground">
                  If you get a 429, wait. Then wait longer. Don't spam retries.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Respect Retry-After</h4>
                <p className="text-sm text-muted-foreground">
                  If we tell you to wait 60 seconds, wait 60 seconds. Not 59.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Cache Responses</h4>
                <p className="text-sm text-muted-foreground">
                  Don't ask for the same data twice if you don't have to.
                </p>
              </div>
            </div>
          </div>
        </section>

        <Callout type="danger" title="The Panic Button">
          If you're under attack, enable "Panic Mode". It blocks everything except
          whitelisted IPs. It's the nuclear option. Use wisely.
        </Callout>
      </div>
    </div>
  );
}
