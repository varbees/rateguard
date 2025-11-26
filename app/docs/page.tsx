import { Metadata } from "next";
import Link from "next/link";
import {
  Shield,
  Zap,
  TrendingUp,
  Layers,
  Activity,
  Globe,
  CreditCard,
  Lock,
  BarChart,
  ArrowRight,
  BookOpen,
  Server,
  CircuitBoard,
  HeartPulse,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Introduction | RateGuard Documentation",
  description: "Introduction to the RateGuard documentation.",
};

export default function DocsIntroductionPage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
          RateGuard Documentation
        </h1>
        <p className="text-xl text-muted-foreground max-w-3xl leading-relaxed">
          Welcome to the comprehensive guide for RateGuard. Learn how to
          integrate, configure, and optimize your API rate limiting and proxy
          service.
        </p>
        <div className="flex gap-4 pt-4">
          <Button asChild size="lg">
            <Link href="/docs/authentication">
              Get Started <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/docs/api-reference">API Reference</Link>
          </Button>
        </div>
      </div>

      {/* Core Features Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/docs/features/transparent-proxy">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <Activity className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Transparent Proxy</CardTitle>
              <CardDescription>
                Seamlessly forward requests with intelligent rate limiting and
                analytics.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/distributed-rate-limiting">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <Server className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Distributed Rate Limiting</CardTitle>
              <CardDescription>
                Redis-backed coordination across unlimited instances for
                consistent limits.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/circuit-breaker">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <CircuitBoard className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Circuit Breaker</CardTitle>
              <CardDescription>
                Automatic failover when upstream APIs fail with graceful
                recovery.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/health-checks">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <HeartPulse className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Health Checks</CardTitle>
              <CardDescription>
                Kubernetes-native health probes and zero-downtime deployments.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/rate-limit-discovery">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <TrendingUp className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Rate Limit Discovery</CardTitle>
              <CardDescription>
                Automatically learn and adapt to upstream API rate limits.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/queue-management">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <Layers className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Queue Management</CardTitle>
              <CardDescription>
                Intelligent request queuing to prevent 429 errors and smooth
                traffic.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/geo-currency">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <Globe className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Geo-Currency</CardTitle>
              <CardDescription>
                Automatic IP-based country and currency detection for localized
                pricing.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/payment-gateways">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <CreditCard className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Payment Gateways</CardTitle>
              <CardDescription>
                Hybrid billing system with Razorpay (India) and Stripe (Global).
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/docs/features/plan-enforcement">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
            <CardHeader>
              <Lock className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Plan Enforcement</CardTitle>
              <CardDescription>
                Strict enforcement of API limits, request quotas, and feature
                access.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Getting Started Section */}
      <div className="space-y-6">
        <h2 className="text-3xl font-bold tracking-tight">Getting Started</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-muted/50 border-none">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-xl">Authentication</CardTitle>
              </div>
              <CardDescription>
                Secure your API requests with API keys and learn about our
                authentication methods.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                variant="secondary"
                className="w-full justify-start"
              >
                <Link href="/docs/authentication">
                  Read Authentication Guide
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-muted/50 border-none">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <CardTitle className="text-xl">
                  Distributed Rate Limiting
                </CardTitle>
              </div>
              <CardDescription>
                Learn how our Redis-backed distributed rate limiting works
                across instances.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                variant="secondary"
                className="w-full justify-start"
              >
                <Link href="/docs/features/distributed-rate-limiting">
                  Read Distributed Guide
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-muted/50 border-none">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CircuitBoard className="h-5 w-5 text-primary" />
                <CardTitle className="text-xl">
                  Circuit Breaker Pattern
                </CardTitle>
              </div>
              <CardDescription>
                Protect your systems with automatic failover and recovery
                mechanisms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                variant="secondary"
                className="w-full justify-start"
              >
                <Link href="/docs/features/circuit-breaker">
                  Read Circuit Breaker Guide
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
