import { Metadata } from "next";
import {
  Globe,
  MapPin,
  Coins,
  Database,
  Zap,
  CheckCircle2,
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
import { geoCurrencyExamples } from "@/lib/docs/code-examples";

export const metadata: Metadata = {
  title: "Geo-Currency Detection | RateGuard Documentation",
  description:
    "Learn how RateGuard automatically detects user location and currency for localized pricing.",
};

export default function GeoCurrencyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12">
        <div className="container max-w-5xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Globe className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Geo-Currency Detection
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                RateGuard automatically detects user location to provide localized
                pricing (INR vs USD) and selects the optimal payment gateway
                (Razorpay vs Stripe).
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              IP-Based
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Redis Caching
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Zero Latency
            </Badge>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-12 space-y-12">
        {/* How It Works */}
        <section>
          <h2 className="text-3xl font-bold mb-6">How It Works</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            When a user signs up or visits the pricing page, RateGuard performs
            the following checks in real-time:
          </p>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <MapPin className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">1. Detect IP</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Extracts IP from Cloudflare headers or request context.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Database className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">2. Lookup</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Checks Redis cache first, then falls back to ipapi.co for location data.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Coins className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">3. Map Currency</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  India (IN) → INR/Razorpay. Rest of World → USD/Stripe.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Zap className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">4. Persist</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Stores `country_code` and `detected_currency` in the user's profile.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Logic Flow */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Detection Logic</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader>
                <CardTitle>India (IN)</CardTitle>
                <CardDescription>Detected via IP or Cloudflare header</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Currency:</span>
                  <span className="font-mono font-medium">INR (₹)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gateway:</span>
                  <span className="font-mono font-medium">Razorpay</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pricing:</span>
                  <span className="font-mono font-medium">PPP Adjusted</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardHeader>
                <CardTitle>Rest of World</CardTitle>
                <CardDescription>All other countries</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Currency:</span>
                  <span className="font-mono font-medium">USD ($)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gateway:</span>
                  <span className="font-mono font-medium">Stripe</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pricing:</span>
                  <span className="font-mono font-medium">Standard Global</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* API Usage */}
        <section>
          <h2 className="text-3xl font-bold mb-6">API Usage</h2>
          <p className="text-muted-foreground mb-6">
            You can programmatically check the detected currency for any IP address
            using the Geo-Currency API.
          </p>
          <CodeTabs examples={geoCurrencyExamples.examples} />
        </section>

        {/* Technical Implementation */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Technical Implementation</h2>
          <p className="text-muted-foreground mb-6">
            The detection process is optimized for performance and reliability:
          </p>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Non-Blocking Execution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Geo-detection runs in a separate goroutine during signup to ensure
                  zero impact on user registration latency.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Redis Caching
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  IP lookups are cached in Redis to minimize external API calls and
                  speed up subsequent requests.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Cloudflare Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Prioritizes `CF-IPCountry` header for instant, edge-based
                  country detection when available.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Callout type="default" title="Note">
          Users can manually override their currency settings if needed, but the
          system defaults to the detected location for the best experience.
        </Callout>
      </div>
    </div>
  );
}
