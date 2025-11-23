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
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { UpgradeModal } from "@/components/pricing/UpgradeModal";

// Pricing data
const pricingTiers = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, annual: 0 },
    icon: Shield,
    description: "Perfect for getting started",
    features: [
      "2 APIs",
      "10K requests/day",
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
    id: "pro",
    name: "Pro",
    price: { monthly: 19, annual: 15.2 }, // 20% off annual
    icon: Zap,
    description: "For growing teams and apps",
    features: [
      "10 APIs",
      "100K requests/day",
      "Advanced analytics",
      "Email support",
      "Priority queue",
      "Custom rate limits",
      "Webhook notifications",
      "99.9% uptime SLA",
    ],
    limitations: [],
    costPer1K: "$0.19",
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    price: { monthly: 49, annual: 39.2 }, // 20% off annual
    icon: Crown,
    description: "For enterprises at scale",
    features: [
      "50 APIs",
      "1M requests/day",
      "Custom rate limits",
      "Dedicated support",
      "99.9% uptime SLA",
      "Advanced security",
      "SSO & team management",
      "Custom integrations",
      "Priority phone support",
      "Dedicated account manager",
    ],
    limitations: [],
    costPer1K: "$0.049",
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
      "Yes! All paid plans include a 7-day free trial. No credit card required to start.",
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
      "Annual plans are billed once per year and include a 20% discount. You can switch to monthly billing at renewal.",
  },
];

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  // ROI Calculator state
  const [currentCost, setCurrentCost] = useState(100);
  const [downtime, setDowntime] = useState(5);

  const calculateROI = () => {
    const rateguardCost = isAnnual ? 19 * 12 * 0.8 : 19 * 12; // Pro plan
    const downtimeCost = (currentCost * downtime) / 100;
    const savings = downtimeCost - rateguardCost;
    return Math.max(0, savings);
  };

  const handleUpgrade = (planId: string) => {
    setSelectedPlan(planId);
    setShowUpgradeModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 sticky top-0 bg-slate-950/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="p-2 bg-blue-500 rounded-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">RateGuard</span>
          </Link>
          <div className="flex gap-4">
            <Link href="/login">
              <Button
                variant="ghost"
                className="text-slate-300 hover:text-white"
              >
                Sign In
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-blue-500 hover:bg-blue-600">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            Start free, upgrade as you grow. No hidden fees, no surprises.
          </p>

          {/* Monthly/Annual Toggle */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <Label
              htmlFor="billing-toggle"
              className={`text-lg ${
                !isAnnual ? "text-white" : "text-slate-400"
              }`}
            >
              Monthly
            </Label>
            <Switch
              id="billing-toggle"
              checked={isAnnual}
              onCheckedChange={setIsAnnual}
              className="data-[state=checked]:bg-blue-500"
            />
            <Label
              htmlFor="billing-toggle"
              className={`text-lg ${
                isAnnual ? "text-white" : "text-slate-400"
              }`}
            >
              Annual
            </Label>
            {isAnnual && (
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                Save 20%
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500">
            All plans include 7-day free trial • Cancel anytime
          </p>
        </section>

        {/* Pricing Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 max-w-6xl mx-auto">
          {pricingTiers.map((tier) => {
            const Icon = tier.icon;
            const price = isAnnual ? tier.price.annual : tier.price.monthly;
            const totalAnnual = isAnnual ? price * 12 : tier.price.annual * 12;

            return (
              <Card
                key={tier.id}
                className={`relative bg-slate-900 border-slate-800 ${
                  tier.popular ? "ring-2 ring-blue-500" : ""
                } ${tier.isCurrent ? "opacity-75" : ""}`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-blue-500 text-white px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}
                {tier.isCurrent && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-slate-700 text-white px-4 py-1">
                      Current Plan
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center pb-8">
                  <div className="mx-auto mb-4 p-3 bg-blue-500/10 rounded-full w-fit">
                    <Icon className="w-8 h-8 text-blue-500" />
                  </div>
                  <CardTitle className="text-2xl text-white mb-2">
                    {tier.name}
                  </CardTitle>
                  <CardDescription className="text-slate-400 mb-4">
                    {tier.description}
                  </CardDescription>

                  <div className="space-y-1">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold text-white">
                        ${price.toFixed(price === 0 ? 0 : 2)}
                      </span>
                      <span className="text-slate-400">
                        /{isAnnual ? "month" : "month"}
                      </span>
                    </div>
                    {isAnnual && price > 0 && (
                      <p className="text-sm text-slate-500">
                        ${totalAnnual.toFixed(2)} billed annually
                      </p>
                    )}
                    <p className="text-xs text-blue-400 font-medium">
                      {tier.costPer1K} per 1K requests
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-300 text-sm">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {tier.isCurrent ? (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      className={`w-full group ${
                        tier.popular
                          ? "bg-blue-500 hover:bg-blue-600"
                          : "bg-slate-800 hover:bg-slate-700"
                      }`}
                      onClick={() => handleUpgrade(tier.id)}
                    >
                      {tier.id === "free" ? "Start Free Trial" : "Upgrade Now"}
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Feature Comparison Table */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Compare Plans
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full max-w-5xl mx-auto bg-slate-900 border border-slate-800 rounded-lg">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-white font-semibold">
                    Feature
                  </th>
                  <th className="text-center p-4 text-white font-semibold">
                    Free
                  </th>
                  <th className="text-center p-4 text-white font-semibold bg-blue-500/5">
                    Pro
                  </th>
                  <th className="text-center p-4 text-white font-semibold">
                    Business
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr>
                  <td className="p-4 text-slate-300">APIs</td>
                  <td className="p-4 text-center text-slate-400">2</td>
                  <td className="p-4 text-center text-white bg-blue-500/5">
                    10
                  </td>
                  <td className="p-4 text-center text-slate-400">50</td>
                </tr>
                <tr>
                  <td className="p-4 text-slate-300">Requests/day</td>
                  <td className="p-4 text-center text-slate-400">10K</td>
                  <td className="p-4 text-center text-white bg-blue-500/5">
                    100K
                  </td>
                  <td className="p-4 text-center text-slate-400">1M</td>
                </tr>
                <tr>
                  <td className="p-4 text-slate-300">Analytics</td>
                  <td className="p-4 text-center text-slate-400">Basic</td>
                  <td className="p-4 text-center text-white bg-blue-500/5">
                    Advanced
                  </td>
                  <td className="p-4 text-center text-slate-400">Advanced</td>
                </tr>
                <tr>
                  <td className="p-4 text-slate-300">Support</td>
                  <td className="p-4 text-center text-slate-400">Community</td>
                  <td className="p-4 text-center text-white bg-blue-500/5">
                    Email
                  </td>
                  <td className="p-4 text-center text-slate-400">Dedicated</td>
                </tr>
                <tr>
                  <td className="p-4 text-slate-300">Priority Queue</td>
                  <td className="p-4 text-center">
                    <span className="text-red-400">✗</span>
                  </td>
                  <td className="p-4 text-center bg-blue-500/5">
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                  <td className="p-4 text-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="p-4 text-slate-300">Custom Rate Limits</td>
                  <td className="p-4 text-center">
                    <span className="text-red-400">✗</span>
                  </td>
                  <td className="p-4 text-center bg-blue-500/5">
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                  <td className="p-4 text-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="p-4 text-slate-300">SLA Guarantee</td>
                  <td className="p-4 text-center text-slate-400">99%</td>
                  <td className="p-4 text-center text-white bg-blue-500/5">
                    99.9%
                  </td>
                  <td className="p-4 text-center text-slate-400">99.9%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ROI Calculator */}
        <section className="mb-20 max-w-4xl mx-auto">
          <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Calculator className="w-6 h-6 text-blue-400" />
                <CardTitle className="text-2xl text-white">
                  Calculate Your ROI
                </CardTitle>
              </div>
              <CardDescription className="text-slate-300">
                See how much RateGuard can save your business
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-white">
                    Monthly API costs without RateGuard
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl text-white">$</span>
                    <input
                      type="number"
                      value={currentCost}
                      onChange={(e) => setCurrentCost(Number(e.target.value))}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-4 py-2 text-white text-lg"
                      min="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">
                    Estimated downtime/errors (%)
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={downtime}
                      onChange={(e) => setDowntime(Number(e.target.value))}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-4 py-2 text-white text-lg"
                      min="0"
                      max="100"
                    />
                    <span className="text-2xl text-white">%</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
                <p className="text-slate-400 mb-2">Estimated Annual Savings</p>
                <p className="text-4xl font-bold text-green-500">
                  ${(calculateROI() * 12).toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  ROI:{" "}
                  {(
                    (calculateROI() / (isAnnual ? 19 * 12 * 0.8 : 19 * 12)) *
                    100
                  ).toFixed(0)}
                  %
                </p>
              </div>

              <p className="text-xs text-slate-400 text-center">
                * Based on average downtime costs and Pro plan pricing
              </p>
            </CardContent>
          </Card>
        </section>

        {/* FAQ Section */}
        <section className="mb-20 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqData.map((faq, index) => (
              <Card
                key={index}
                className="bg-slate-900 border-slate-800 cursor-pointer hover:border-slate-700 transition-colors"
                onClick={() =>
                  setExpandedFaq(expandedFaq === index ? null : index)
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">
                        {faq.question}
                      </h3>
                    </div>
                    {expandedFaq === index ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </CardHeader>
                {expandedFaq === index && (
                  <CardContent>
                    <p className="text-slate-300">{faq.answer}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </section>

        {/* Trust Badges */}
        <section className="text-center mb-20">
          <h3 className="text-xl font-semibold text-white mb-6">
            Trusted by Developers Worldwide
          </h3>
          <div className="flex flex-wrap justify-center gap-8 text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>No Hidden Fees</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Cancel Anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>30-Day Money Back</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>7-Day Free Trial</span>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-slate-300 mb-8">
            Join thousands of developers using RateGuard to protect their APIs
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-500 hover:bg-blue-600">
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-slate-700 hover:bg-slate-800"
              >
                View Documentation
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 mt-20">
        <div className="container mx-auto px-4 text-center text-slate-400">
          <p>&copy; 2025 RateGuard. All rights reserved.</p>
        </div>
      </footer>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        selectedPlan={selectedPlan}
        isAnnual={isAnnual}
      />
    </div>
  );
}
