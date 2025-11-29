import { Metadata } from "next";
import { Layers, Server, Database, Globe, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Core Architecture | RateGuard Documentation",
  description: "Deep dive into RateGuard's architecture.",
};

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Layers className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Core Architecture
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              How we handle millions of requests without breaking a sweat (or your budget).
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* High Level Overview */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">High-Level Overview</h2>
          <p className="text-lg text-muted-foreground">
            RateGuard is built on a distributed architecture designed for low latency and high availability.
            We use a combination of edge proxies, a high-performance Go backend, and Redis for state management.
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-5 text-primary" />
                  Edge Proxies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Requests hit our edge nodes first. We verify API keys and check local caches for rate limits.
                  If everything looks good, we forward the request to the upstream API (e.g., OpenAI).
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="size-5 text-primary" />
                  Redis Cluster
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  We use Redis for distributed rate limiting. It's fast, atomic, and lets us synchronize limits across the globe.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="size-5 text-primary" />
                  Go Backend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Our core logic is written in Go. It handles token counting, analytics aggregation, and complex rate limiting rules.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="size-5 text-primary" />
                  Async Workers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Analytics and webhooks are processed asynchronously to ensure they never slow down your API requests.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Dual Concurrency Model */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Dual Concurrency Model</h2>
          <p className="text-lg text-muted-foreground">
            We use a unique dual concurrency model to balance performance and reliability.
          </p>
          
          <div className="space-y-4">
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">1. The Fast Lane (Proxy)</h3>
              <p className="text-muted-foreground">
                The proxy path is optimized for raw speed. It uses unbounded goroutines to handle as many requests as possible.
                Blocking here is forbidden.
              </p>
            </div>
            
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2">2. The Safe Lane (Aggregation)</h3>
              <p className="text-muted-foreground">
                Background tasks like analytics aggregation and database writes run in a fixed-size worker pool.
                This prevents a spike in traffic from overwhelming our database.
              </p>
            </div>
          </div>

          <Callout type="default" title="Why this matters">
            This architecture ensures that even if our analytics system is under heavy load, your API requests will still go through with minimal latency.
          </Callout>
        </section>

        {/* Token Counting */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Token Counting</h2>
          <p className="text-lg text-muted-foreground">
            For LLM APIs, we inspect the response body to extract token usage. This happens on the fly as the response streams back to the client.
          </p>
          <p className="text-lg text-muted-foreground">
            We support standard formats (OpenAI) and are adding more providers regularly.
          </p>
        </section>
      </div>
    </div>
  );
}
