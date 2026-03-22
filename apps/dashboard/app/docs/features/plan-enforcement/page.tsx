import { Metadata } from "next";
import {
  Lock,
  Shield,
  Zap,
  Briefcase,
  Building2,
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
  title: "Policy Presets & Guardrails | RateGuard Documentation",
  description:
    "Learn how RateGuard applies policy presets, quotas, and guardrails.",
};

export default function PlanEnforcementPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Lock className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Policy Presets & Guardrails
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              No hidden tiers. Pick a preset, then use guardrails and overrides where they make sense.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Tiers */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">The Presets</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            These presets describe the default guardrail profile for your deployment.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="size-4 text-gray-500" />
                  dev
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>For local testing and sandbox deployments.</p>
                <ul className="list-disc pl-4 space-y-1 mt-2">
                  <li>Low request ceilings</li>
                  <li>Strict retry and queue defaults</li>
                  <li>Fast feedback for local iteration</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Briefcase className="size-4 text-primary" />
                  standard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>For the default production path.</p>
                <ul className="list-disc pl-4 space-y-1 mt-2">
                  <li>Balanced request and token limits</li>
                  <li>General-purpose queueing</li>
                  <li>Guardrails tuned for everyday traffic</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="size-4 text-purple-500" />
                  high-throughput
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>For workloads that stay busy all day and do not apologize for it.</p>
                <ul className="list-disc pl-4 space-y-1 mt-2">
                  <li>Higher concurrency and burst capacity</li>
                  <li>Tighter observability expectations</li>
                  <li>Queue and retry paths under load</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Quotas */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Quotas vs Rate Limits</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Know the difference. It keeps policy decisions predictable and your operators less surprised.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rate Limits</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Short-term protection. "Slow down, you're going too fast."
                (e.g., 10 req/sec)
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quotas</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Long-term allocation. "You've used up your allowance for the month."
                (e.g., 1M req/month)
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Headers */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Tracking Usage</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Check the headers. We tell you exactly where you stand.
          </p>

          <CodeTabs
            examples={[
              {
                label: "Response Headers",
                language: "http",
                code: `X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1699999999
X-Quota-Limit: 1000000
X-Quota-Remaining: 450000`,
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
