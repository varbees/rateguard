import { Metadata } from "next";
import {
  ShieldAlert,
  Lock,
  Gauge,
  AlertOctagon,
  CheckCircle2,
  XCircle,
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
import { planEnforcementExamples } from "@/lib/docs/code-examples";

export const metadata: Metadata = {
  title: "Plan Enforcement | RateGuard Documentation",
  description:
    "Understand how RateGuard enforces plan limits, quotas, and feature access.",
};

export default function PlanEnforcementPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12">
        <div className="container max-w-5xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Lock className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Plan Enforcement
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                RateGuard strictly enforces plan limits to ensure fair usage and
                monetization. This includes request quotas, API key limits, and
                access to premium features.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Strict Enforcement
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Real-time Tracking
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Graceful Rejection
            </Badge>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-12 space-y-12">
        {/* Enforcement Types */}
        <section>
          <h2 className="text-3xl font-bold mb-6">What We Enforce</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <Gauge className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">Request Quotas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Monthly request limits based on the user's plan (e.g., 100k
                  requests/month for Free Tier).
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <ShieldAlert className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">API Key Limits</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Maximum number of active API keys allowed per account.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Lock className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">Feature Access</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Access to advanced features like Custom Domains, Analytics, and
                  Team Management.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* API Usage */}
        <section>
          <h2 className="text-3xl font-bold mb-6">API Usage</h2>
          <p className="text-muted-foreground mb-6">
            Check if a user has access to specific features based on their plan.
          </p>
          <CodeTabs examples={planEnforcementExamples.examples} />
        </section>

        {/* Quota Exceeded Behavior */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Quota Exceeded Behavior</h2>
          <p className="text-muted-foreground mb-6">
            When a user exceeds their plan's request quota, RateGuard immediately
            stops processing requests to prevent abuse.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-l-4 border-l-red-500">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <CardTitle>Blocked Request</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Requests will be rejected with a 429 status code and a specific
                  error message.
                </p>
                <CodeTabs
                  examples={[
                    {
                      label: "Response",
                      language: "json",
                      code: `{
  "error": "Plan quota exceeded",
  "code": "quota_exceeded",
  "message": "You have used 100% of your monthly request quota. Please upgrade your plan to continue.",
  "upgrade_url": "https://rateguard.io/dashboard/billing"
}`
                    }
                  ]}
                />
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-5 w-5 text-yellow-500" />
                  <CardTitle>Warning Thresholds</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  We send email notifications when usage reaches specific
                  thresholds to prevent unexpected downtime.
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    80% Usage Warning
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    90% Usage Warning
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    100% Usage Alert (Service Paused)
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Feature Gating */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Feature Gating</h2>
          <p className="text-muted-foreground mb-6">
            Certain features are only available on higher-tier plans. The API and
            Dashboard will enforce these restrictions.
          </p>

          <Card>
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Feature</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Free Tier</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Pro Tier</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Business Tier</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">Monthly Requests</td>
                    <td className="p-4 align-middle">100,000</td>
                    <td className="p-4 align-middle">1,000,000</td>
                    <td className="p-4 align-middle">Unlimited</td>
                  </tr>
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">API Keys</td>
                    <td className="p-4 align-middle">3</td>
                    <td className="p-4 align-middle">10</td>
                    <td className="p-4 align-middle">Unlimited</td>
                  </tr>
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">Analytics Retention</td>
                    <td className="p-4 align-middle">24 Hours</td>
                    <td className="p-4 align-middle">30 Days</td>
                    <td className="p-4 align-middle">1 Year</td>
                  </tr>
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">Custom Domains</td>
                    <td className="p-4 align-middle"><XCircle className="h-4 w-4 text-muted-foreground" /></td>
                    <td className="p-4 align-middle"><CheckCircle2 className="h-4 w-4 text-green-500" /></td>
                    <td className="p-4 align-middle"><CheckCircle2 className="h-4 w-4 text-green-500" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <Callout type="default" title="Need more?">
          Contact our sales team for custom enterprise plans with higher limits and
          dedicated support.
        </Callout>
      </div>
    </div>
  );
}
