import { Metadata } from "next";
import {
  CreditCard,
  Landmark,
  ShieldCheck,
  Zap,
  Banknote,
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
  title: "Payment Gateways | RateGuard Documentation",
  description:
    "Learn how RateGuard integrates with Stripe and Razorpay for seamless billing.",
};

export default function PaymentGatewaysPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <CreditCard className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Payment Gateways
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We take money. We're good at it. We use Stripe and Razorpay because
              building your own payment processor is a terrible idea. Just ask
              Ryan about WUPHF.com.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Supported Providers */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Supported Providers</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We support the big players. Secure, reliable, and compliant.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="size-4 text-purple-500" />
                  Stripe
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Global standard. Works almost everywhere.
                </p>
                <div className="flex gap-2">
                  <Badge variant="outline">Cards</Badge>
                  <Badge variant="outline">Apple Pay</Badge>
                  <Badge variant="outline">Google Pay</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="size-4 text-blue-500" />
                  Razorpay
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Best for India. UPI support included.
                </p>
                <div className="flex gap-2">
                  <Badge variant="outline">UPI</Badge>
                  <Badge variant="outline">Netbanking</Badge>
                  <Badge variant="outline">Wallets</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Security */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Security</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We don't touch your credit card numbers. We don't want to. That's a
            liability nightmare.
          </p>

          <Callout type="success" title="PCI Compliance">
            We use tokenization. Your card data goes directly to Stripe/Razorpay.
            We just get a token that says "yeah, they're good for it."
          </Callout>
        </section>

        {/* Integration */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Billing Portal</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Users can manage their subscriptions via the self-serve portal.
            Invoices, upgrades, downgrades - it's all there.
          </p>

          <CodeTabs
            examples={[
              {
                label: "Redirect to Portal",
                language: "javascript",
                code: `// Redirect user to billing portal
window.location.href = 'https://rateguard.io/dashboard/billing';`,
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
