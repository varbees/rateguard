import { Metadata } from "next";
import {
  Server,
  Zap,
  Layers,
  Globe,
  Database,
  ArrowRightLeft,
  Scale,
  Cpu,
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
  title: "Distributed Rate Limiting | RateGuard Documentation",
  description:
    "Learn how RateGuard uses Redis and CRDT-inspired counters to manage rate limits across the globe without losing its mind.",
};

export default function DistributedRateLimitingPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Server className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Distributed Rate Limiting
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Because one server is never enough, and race conditions are the
              Dementors of distributed systems. We handle the chaos so you don't
              have to.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Architecture */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">The Architecture</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We use Redis. Yes, it's not original, but unlike that experimental
            NoSQL database you tried last year, it actually works.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-primary" />
                  Redis Backend
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Atomic counters. Lua scripts. Sub-millisecond latency. It's the
                Usain Bolt of key-value stores.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ArrowRightLeft className="size-4 text-primary" />
                  Synchronization
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We sync counters across instances faster than gossip spreads in
                the break room.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* How It Works */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">The Algorithm</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We use a sliding window algorithm. It's like a bouncer who remembers
            faces, not just counts heads.
          </p>

          <CodeTabs
            examples={[
              {
                label: "Lua Script (Simplified)",
                language: "lua",
                code: `-- This is basically what runs on Redis
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Remove old entries
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- Count current entries
local count = redis.call('ZCARD', key)

if count < limit then
    -- Add new request
    redis.call('ZADD', key, now, now)
    redis.call('PEXPIRE', key, window)
    return 1 -- Allowed
else
    return 0 -- Blocked
end`,
              },
            ]}
          />
        </section>

        {/* Configuration */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Configuration</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Setting up distributed rate limiting is easier than assembling IKEA
            furniture. And with fewer leftover parts.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold">Enable Redis</h4>
                <p className="text-sm text-muted-foreground">
                  Set <code>REDIS_URL</code> in your environment variables.
                </p>
              </div>
              <Badge variant="outline" className="font-mono">
                Required
              </Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold">Cluster Mode</h4>
                <p className="text-sm text-muted-foreground">
                  We support Redis Cluster out of the box. No extra config needed.
                </p>
              </div>
              <Badge variant="secondary">Auto-detected</Badge>
            </div>
          </div>
        </section>

        <Callout type="default" title="Did you know?">
          Our distributed rate limiter can handle over 100,000 requests per
          second. That's more than the number of times Michael Scott said
          "That's what she said."
        </Callout>

        {/* Global Consistency */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Global Consistency</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Whether your user is in New York, London, or Scranton, their rate
            limit is the same. We don't discriminate based on geography.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <div className="text-2xl font-bold mb-1">Region A</div>
              <div className="text-sm text-muted-foreground">
                User makes 5 requests
              </div>
            </div>
            <div className="flex items-center justify-center text-muted-foreground">
              <ArrowRightLeft className="size-6" />
            </div>
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <div className="text-2xl font-bold mb-1">Region B</div>
              <div className="text-sm text-muted-foreground">
                User sees 5 requests used
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
