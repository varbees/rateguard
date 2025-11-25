import { Metadata } from "next";
import Link from "next/link";
import {
  TrendingUp,
  Search,
  Database,
  BarChart,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
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

export const metadata: Metadata = {
  title: "Rate Limit Discovery | RateGuard Documentation",
  description:
    "Learn how RateGuard automatically discovers and suggests optimal rate limits.",
};

export default function RateLimitDiscoveryPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12">
        <div className="container max-w-5xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <TrendingUp className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Rate Limit Discovery
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                RateGuard automatically learns API rate limits by observing 429
                responses and provides intelligent suggestions with confidence scores.
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Zero Configuration
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Auto-Learning
            </Badge>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-12 space-y-12">
        {/* How It Works */}
        <section>
          <h2 className="text-3xl font-bold mb-6">How It Works</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Rate Limit Discovery is an intelligent system that observes your API
            traffic and learns the real rate limits by analyzing responses:
          </p>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <Search className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">1. Observe</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Proxy forwards requests and watches for 429 (Too Many Requests) responses.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Database className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">2. Store</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Parses headers (X-RateLimit-Limit) and stores observations asynchronously.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <BarChart className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">3. Analyze</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Statistical algorithms analyze patterns to calculate confidence scores.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Lightbulb className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">4. Suggest</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Generates actionable suggestions for one-click application in the dashboard.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Supported Headers */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Supported Headers</h2>
          <p className="text-muted-foreground mb-6">
            RateGuard automatically detects rate limit information from multiple
            header formats:
          </p>
          
          <Card>
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Format</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Example</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Provider</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">Standard</td>
                    <td className="p-4 align-middle"><code className="bg-muted px-1 py-0.5 rounded">X-RateLimit-Limit</code></td>
                    <td className="p-4 align-middle">GitHub, Stripe, Twitter</td>
                  </tr>
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">Alternative</td>
                    <td className="p-4 align-middle"><code className="bg-muted px-1 py-0.5 rounded">X-Rate-Limit-Limit</code></td>
                    <td className="p-4 align-middle">Various APIs</td>
                  </tr>
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">OpenAI Style</td>
                    <td className="p-4 align-middle"><code className="bg-muted px-1 py-0.5 rounded">x-ratelimit-limit-requests</code></td>
                    <td className="p-4 align-middle">OpenAI</td>
                  </tr>
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">Cloudflare</td>
                    <td className="p-4 align-middle"><code className="bg-muted px-1 py-0.5 rounded">CF-RateLimit-Limit</code></td>
                    <td className="p-4 align-middle">Cloudflare</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Confidence Scores */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Confidence Scores</h2>
          <p className="text-muted-foreground mb-6">
            RateGuard calculates confidence using statistical analysis (Coefficient of Variation):
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <CardHeader>
                <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  High (≥80%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Very consistent observations. Safe to apply automatically.</p>
              </CardContent>
            </Card>

            <Card className="bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
              <CardHeader>
                <CardTitle className="text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Medium (≥60%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Moderate consistency. Review before applying.</p>
              </CardContent>
            </Card>

            <Card className="bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
              <CardHeader>
                <CardTitle className="text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Lower (&lt;60%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Variable observations. Requires manual verification.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* API Usage */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Programmatic Access</h2>
          <p className="text-muted-foreground mb-6">
            You can access rate limit discovery data via the API:
          </p>

          <CodeTabs
            examples={[
              {
                label: "Get Suggestions",
                language: "bash",
                code: `GET /api/v1/apis/:id/rate-limit/suggestions

# Response
{
  "api_id": "...",
  "api_name": "stripe_prod",
  "suggested_per_second": 10,
  "confidence_score": 85,
  "observation_count": 15,
  "recommendation_reason": "Detected lower per-second limit"
}`
              },
              {
                label: "Apply Suggestions",
                language: "curl",
                code: `POST /api/v1/apis/:id/rate-limit/apply

# Response
{
  "success": true,
  "message": "Rate limits updated based on suggestions",
  "applied": {
    "per_second": 10,
    "per_hour": 600
  }
}`
              }
            ]}
          />
        </section>

        <Callout type="default" title="Ready to try it?">
          Head to your <Link href="/dashboard/apis" className="font-medium underline">API Management</Link> page and start routing traffic through RateGuard!
        </Callout>
      </div>
    </div>
  );
}
