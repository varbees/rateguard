import { Metadata } from "next";
import {
  CreditCard,
  Globe,
  IndianRupee,
  DollarSign,
  ShieldCheck,
  RefreshCw,
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
import { paymentGatewayExamples } from "@/lib/docs/code-examples";

export const metadata: Metadata = {
  title: "Payment Gateways | RateGuard Documentation",
  description:
    "Learn about RateGuard's hybrid billing system using Razorpay and Stripe.",
};

export default function PaymentGatewaysPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12">
        <div className="container max-w-5xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <CreditCard className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Payment Gateways
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                RateGuard employs a hybrid billing strategy, utilizing Razorpay for
                Indian customers and Stripe for the rest of the world to ensure
                optimal payment success rates and compliance.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Hybrid Model
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Auto-Routing
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              Secure
            </Badge>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-12 space-y-12">
        {/* Strategy */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Hybrid Strategy</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-l-4 border-l-blue-600">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-blue-600" />
                  <CardTitle>Razorpay (India)</CardTitle>
                </div>
                <CardDescription>Optimized for Indian market</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    Full UPI Support (PhonePe, GPay, Paytm)
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    NetBanking & Wallets
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    RBI Compliant Recurring Payments
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    Lower Transaction Fees (2%)
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-indigo-500">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-indigo-500" />
                  <CardTitle>Stripe (Global)</CardTitle>
                </div>
                <CardDescription>Best-in-class global payments</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    Global Card Support (Visa, Mastercard, Amex)
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    Apple Pay & Google Pay
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    Advanced Fraud Detection
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    Seamless Subscription Management
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Pricing */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Localized Pricing</h2>
          <p className="text-muted-foreground mb-6">
            We offer Purchasing Power Parity (PPP) adjusted pricing for India to
            make our services accessible to developers everywhere.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Free Tier</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2">₹0 / $0</div>
                <p className="text-sm text-muted-foreground">
                  Forever free for hobbyists
                </p>
              </CardContent>
            </Card>

            <Card className="border-primary/50 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-lg">Pro Tier</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-bold">₹499</span>
                  <span className="text-sm text-muted-foreground">/mo (IN)</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-muted-foreground">$19</span>
                  <span className="text-sm text-muted-foreground">/mo (Global)</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Business Tier</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-bold">₹1,499</span>
                  <span className="text-sm text-muted-foreground">/mo (IN)</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-muted-foreground">$49</span>
                  <span className="text-sm text-muted-foreground">/mo (Global)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* API Usage */}
        <section>
          <h2 className="text-3xl font-bold mb-6">API Usage</h2>
          <p className="text-muted-foreground mb-6">
            Initiate a checkout session programmatically. The API automatically
            selects the correct gateway based on the currency.
          </p>
          <CodeTabs examples={paymentGatewayExamples.examples} />
        </section>

        {/* Integration Details */}
        <section>
          <h2 className="text-3xl font-bold mb-6">Integration Details</h2>
          <p className="text-muted-foreground mb-6">
            The backend handles the complexity of managing two payment providers
            seamlessly.
          </p>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Webhook Handling</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  We verify webhook signatures for both providers to ensure security
                  and process events idempotently.
                </p>
                <CodeTabs
                  examples={[
                    {
                      label: "Endpoints",
                      language: "bash",
                      code: `# Razorpay Webhook
POST /api/v1/billing/razorpay/webhook

# Stripe Webhook
POST /api/v1/billing/stripe/webhook`
                    }
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Checkout Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>User clicks "Upgrade" on the dashboard.</li>
                  <li>Backend checks user's detected country/currency.</li>
                  <li>
                    Creates a checkout session with the appropriate provider
                    (Razorpay Order or Stripe Session).
                  </li>
                  <li>Returns the checkout URL or ID to the frontend.</li>
                  <li>Frontend redirects user to the secure payment page.</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </section>

        <Callout type="warning" title="Currency Changes">
          Once a subscription is active, the currency cannot be changed. Users must
          cancel their current subscription to switch billing regions.
        </Callout>
      </div>
    </div>
  );
}
