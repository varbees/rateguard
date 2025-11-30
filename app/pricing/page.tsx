"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  Shield,
  Zap,
  Crown,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { UpgradeModal } from "@/components/pricing/UpgradeModal";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/landing/Header";
import { useGeo } from "@/hooks/use-geo";
import { PRICING_TIERS, CURRENCY_SYMBOLS } from "@/lib/constants";

// Pricing data
const pricingTiers = [
  {
    id: "free",
    name: "Free",
    // price removed, calculated dynamically
    icon: Shield,
    description: "Perfect for hobbyists and side projects",
    features: [
      "3 APIs",
      "100K requests/month",
      "100k tokens/month",
      "Basic analytics",
      "Community support",
      "99% uptime",
      "Email notifications",
    ],
    limitations: ["No advanced features", "Standard queue priority"],
    costPer1K: "Free",
    isCurrent: true,
  },
  {
    id: "starter",
    name: "Starter",
    // price removed, calculated dynamically
    icon: Zap,
    description: "For growing startups and serious developers",
    features: [
      "10 APIs",
      "1M requests/month",
      "10M tokens/month",
      "Advanced analytics",
      "Email support (24h response)",
      "Priority queue",
      "Custom rate limits",
      "Webhook notifications",
      "99.9% uptime SLA",
    ],
    limitations: [],
    costPer1K: "$0.029",
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    // price removed, calculated dynamically
    icon: Crown,
    description: "For scaling teams with high volume needs",
    features: [
      "Unlimited APIs",
      "10M requests/month",
      "LLM token tracking",
      "Custom rate limits & rules",
      "Dedicated support channel",
      "99.99% uptime SLA",
      "Advanced security (WAF)",
      "SSO & team management",
      "Custom integrations",
      "Priority phone support",
      "Dedicated account manager",
    ],
    limitations: [],
    costPer1K: "$0.009",
    enterprise: true,
  },
];

const faqData = [
  {
    question: "Can I change plans anytime?",
    answer:
      "Yes! You can upgrade, downgrade, or cancel anytime. Upgrades take effect immediately, downgrades at the end of your billing period.",
  },
  {
    question: "What happens if I exceed my request limit?",
    answer:
      "We'll notify you at 80% usage. If you exceed limits, requests will be queued but may experience delays. Upgrade anytime for instant relief.",
  },
  {
    question: "Is there a free trial for paid plans?",
    answer:
      "Yes! All paid plans include a 14-day free trial. No credit card required to start.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes! We offer a 30-day money-back guarantee. If you're not satisfied, we'll refund your payment, no questions asked.",
  },
  {
    question: "Are there any hidden fees?",
    answer:
      "No hidden fees, ever. The price you see is the price you pay. No setup fees, no cancellation fees.",
  },
  {
    question: "How does billing work for annual plans?",
    answer:
      "Annual plans are billed once per year and include a significant discount (up to 20%). You can switch to monthly billing at renewal.",
  },
];

export default function PricingPage() {
  const { Currency: currency, isLoading } = useGeo();
  const [isAnnual, setIsAnnual] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  // ROI Calculator state
  const [currentCost, setCurrentCost] = useState(100);
  const [downtime, setDowntime] = useState(5);

  const calculateROI = () => {
    // Default to USD for ROI calc if loading, or use current currency
    const safeCurrency = isLoading ? "USD" : currency;
    const monthlyPrice =
      PRICING_TIERS.PRO[safeCurrency as keyof typeof PRICING_TIERS.PRO];
    const annualPrice = monthlyPrice * 0.8; // Approx 20% discount

    const rateguardCost = isAnnual ? annualPrice * 12 : monthlyPrice * 12;
    const downtimeCost = (currentCost * downtime) / 100;
    const savings = downtimeCost - rateguardCost;
    return Math.max(0, savings);
  };

  const handleUpgrade = (planId: string) => {
    setSelectedPlan(planId);
    setShowUpgradeModal(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <Header />

      <main className="container mx-auto px-4 py-12 md:py-24">
        {/* Hero Section */}
        <section className="text-center mb-16 animate-fade-in-up">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Start free, upgrade as you grow. No hidden fees, no surprises.
            <br />
            Built for developers, by developers.
          </p>

          {/* Monthly/Annual Toggle */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <Label
              htmlFor="billing-toggle"
              className={`text-lg cursor-pointer ${
                !isAnnual
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground"
              }`}
              onClick={() => setIsAnnual(false)}
            >
              Monthly
            </Label>
            <Switch
              id="billing-toggle"
              checked={isAnnual}
              onCheckedChange={setIsAnnual}
              className="data-[state=checked]:bg-primary"
            />
            <Label
              htmlFor="billing-toggle"
              className={`text-lg cursor-pointer ${
                isAnnual
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground"
              }`}
              onClick={() => setIsAnnual(true)}
            >
              Annual
            </Label>
            {isAnnual && (
              <Badge
                variant="secondary"
                className="text-primary border-primary/20 animate-pulse-glow"
              >
                Save ~20%
              </Badge>
            )}
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24 max-w-7xl mx-auto">
          {pricingTiers.map((tier, index) => {
            const Icon = tier.icon;

            // Calculate dynamic price
            const safeCurrency = isLoading ? "USD" : currency;
            const tierKey = tier.id.toUpperCase() as keyof typeof PRICING_TIERS;
            const monthlyPrice =
              PRICING_TIERS[tierKey][
                safeCurrency as keyof typeof PRICING_TIERS.FREE
              ];
            const annualPrice = Math.floor(monthlyPrice * 0.8); // 20% discount for annual

            const displayPrice = isAnnual ? annualPrice : monthlyPrice;
            const totalAnnual = displayPrice * 12;
            const symbol = CURRENCY_SYMBOLS[safeCurrency] || "$";

            return (
              <Card
                key={tier.id}
                className={`relative flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-2 ${
                  tier.popular
                    ? "border-primary shadow-lg shadow-primary/10 scale-105 z-10"
                    : "border-border bg-card/50"
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-4 py-1 shadow-lg">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center pb-8 pt-8">
                  <div
                    className={`mx-auto mb-4 p-3 rounded-full w-fit ${
                      tier.popular ? "bg-primary/10" : "bg-muted"
                    }`}
                  >
                    <Icon
                      className={`w-8 h-8 ${
                        tier.popular ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <CardTitle className="text-2xl font-bold mb-2">
                    {tier.name}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground mb-4 h-10">
                    {tier.description}
                  </CardDescription>

                  <div className="space-y-1">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold">
                        {symbol}
                        {displayPrice}
                      </span>
                      <span className="text-muted-foreground">
                        /{isAnnual ? "mo" : "mo"}
                      </span>
                    </div>
                    {isAnnual && displayPrice > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Billed {symbol}
                        {totalAnnual} yearly
                      </p>
                    )}
                    <p className="text-xs text-primary font-medium mt-2">
                      {tier.costPer1K} per 1K requests
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="space-y-8 flex-1 flex flex-col">
                  <ul className="space-y-4 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground/80">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="lg"
                    variant={tier.popular ? "default" : "outline"}
                    className={`w-full group ${
                      tier.popular ? "shadow-lg shadow-primary/20" : ""
                    }`}
                    onClick={() => handleUpgrade(tier.id)}
                  >
                    {tier.id === "free" ? "Start Free" : "Get Started"}
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Feature Comparison Table */}
        <section
          className="mb-24 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          <h2 className="text-3xl font-bold text-center mb-12">
            Compare Plans
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card/50 shadow-sm">
            <table className="w-full max-w-5xl mx-auto">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-6 font-semibold">Feature</th>
                  <th className="text-center p-6 font-semibold">Free</th>
                  <th className="text-center p-6 font-semibold text-primary bg-primary/5">
                    Starter
                  </th>
                  <th className="text-center p-6 font-semibold">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/10">
                  <td className="p-4 pl-6 font-medium">APIs</td>
                  <td className="p-4 text-center text-muted-foreground">3</td>
                  <td className="p-4 text-center font-bold bg-primary/5">10</td>
                  <td className="p-4 text-center text-muted-foreground">
                    Unlimited
                  </td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="p-4 pl-6 font-medium">Requests/month</td>
                  <td className="p-4 text-center text-muted-foreground">
                    100K
                  </td>
                  <td className="p-4 text-center font-bold bg-primary/5">1M</td>
                  <td className="p-4 text-center text-muted-foreground">10M</td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="p-4 pl-6 font-medium">Tokens/month</td>
                  <td className="p-4 text-center text-muted-foreground">
                    100K
                  </td>
                  <td className="p-4 text-center font-bold bg-primary/5">
                    10M
                  </td>
                  <td className="p-4 text-center text-muted-foreground">
                    100M
                  </td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="p-4 pl-6 font-medium">Analytics</td>
                  <td className="p-4 text-center text-muted-foreground">
                    Basic
                  </td>
                  <td className="p-4 text-center font-bold bg-primary/5">
                    Advanced
                  </td>
                  <td className="p-4 text-center text-muted-foreground">
                    Advanced
                  </td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="p-4 pl-6 font-medium">Rate Limiting</td>
                  <td className="p-4 text-center text-muted-foreground">
                    Standard
                  </td>
                  <td className="p-4 text-center font-bold bg-primary/5">
                    Custom Rules
                  </td>
                  <td className="p-4 text-center text-muted-foreground">
                    Advanced WAF
                  </td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="p-4 pl-6 font-medium">Support</td>
                  <td className="p-4 text-center text-muted-foreground">
                    Community
                  </td>
                  <td className="p-4 text-center font-bold bg-primary/5">
                    Email (24h)
                  </td>
                  <td className="p-4 text-center text-muted-foreground">
                    Dedicated
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ROI Calculator */}
        <section
          className="mb-24 max-w-4xl mx-auto animate-fade-in-up"
          style={{ animationDelay: "400ms" }}
        >
          <Card className="overflow-hidden border-primary/20 shadow-2xl shadow-primary/5">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Calculator className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Calculate Your ROI</CardTitle>
              </div>
              <CardDescription>
                See how much RateGuard can save your business by preventing
                downtime
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 relative">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label>Monthly API costs without RateGuard</Label>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md border border-input px-3 focus-within:ring-2 focus-within:ring-ring">
                    <span className="text-xl text-muted-foreground">
                      {isLoading ? "$" : CURRENCY_SYMBOLS[currency] || "$"}
                    </span>
                    <input
                      type="number"
                      value={currentCost}
                      onChange={(e) => setCurrentCost(Number(e.target.value))}
                      className="flex-1 bg-transparent border-none py-2 text-lg focus:outline-none"
                      min="0"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Estimated downtime/errors (%)</Label>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md border border-input px-3 focus-within:ring-2 focus-within:ring-ring">
                    <input
                      type="number"
                      value={downtime}
                      onChange={(e) => setDowntime(Number(e.target.value))}
                      className="flex-1 bg-transparent border-none py-2 text-lg focus:outline-none"
                      min="0"
                      max="100"
                    />
                    <span className="text-xl text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-8 text-center shadow-inner">
                <p className="text-muted-foreground mb-2 font-medium">
                  Estimated Annual Savings
                </p>
                <p className="text-5xl font-bold text-green-500 mb-2">
                  {isLoading ? "$" : CURRENCY_SYMBOLS[currency] || "$"}
                  {(calculateROI() * 12).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">
                  ROI:{" "}
                  <span className="font-bold text-foreground">
                    {(
                      (calculateROI() /
                        (isAnnual
                          ? PRICING_TIERS.PRO[
                              currency as keyof typeof PRICING_TIERS.PRO
                            ] *
                            0.8 *
                            12
                          : PRICING_TIERS.PRO[
                              currency as keyof typeof PRICING_TIERS.PRO
                            ] * 12)) *
                      100
                    ).toFixed(0)}
                    %
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* FAQ Section */}
        <section
          className="mb-24 max-w-3xl mx-auto animate-fade-in-up"
          style={{ animationDelay: "500ms" }}
        >
          <h2 className="text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqData.map((faq, index) => (
              <Card
                key={index}
                className={`cursor-pointer transition-all duration-200 hover:border-primary/50 ${
                  expandedFaq === index
                    ? "border-primary/50 bg-primary/5"
                    : "bg-card"
                }`}
                onClick={() =>
                  setExpandedFaq(expandedFaq === index ? null : index)
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold pr-8">
                      {faq.question}
                    </h3>
                    {expandedFaq === index ? (
                      <ChevronUp className="w-5 h-5 text-primary flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                </CardHeader>
                {expandedFaq === index && (
                  <CardContent className="animate-fade-in-up">
                    <p className="text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center relative overflow-hidden rounded-3xl p-12 md:p-20 border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Scale?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Join thousands of developers using RateGuard to protect their APIs
              and sleep better at night.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="w-full sm:w-auto text-lg px-8 py-6 shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/docs">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto text-lg px-8 py-6 hover:bg-muted"
                >
                  Read Documentation
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        selectedPlan={selectedPlan}
        isAnnual={isAnnual}
      />
    </div>
  );
}
