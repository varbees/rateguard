"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Shield,
  Zap,
  BarChart3,
  Lock,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Shield,
    title: "Rate Limit Protection",
    description:
      "Never hit API rate limits again with intelligent queuing and retry logic",
  },
  {
    icon: Zap,
    title: "Transparent Proxy",
    description: "Just change your API URL - no code changes required",
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    description: "Monitor usage, success rates, and performance in real-time",
  },
  {
    icon: Lock,
    title: "Secure & Reliable",
    description: "Enterprise-grade security with 99.9% uptime guarantee",
  },
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    features: [
      "Up to 3 APIs",
      "10,000 requests/month",
      "Basic rate limiting",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    features: [
      "Up to 20 APIs",
      "1M requests/month",
      "Advanced features",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "Unlimited APIs",
      "Unlimited requests",
      "Custom integrations",
      "Dedicated support",
    ],
  },
];

export default function LandingPage() {
  const router = useRouter();
  const isAuthenticated = useDashboardStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500 rounded-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">RateGuard</span>
          </div>
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

      {/* Hero Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold text-white mb-6">
            Never Hit API Rate Limits Again
          </h1>
          <p className="text-xl text-slate-400 mb-8 max-w-3xl mx-auto">
            RateGuard is a transparent proxy that intelligently manages your API
            rate limits, queues requests, and provides real-time analytics. Just
            change your API URL.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-500 hover:bg-blue-600">
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-900/50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Why Choose RateGuard?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className="bg-slate-900 border-slate-800"
                >
                  <CardHeader>
                    <div className="p-3 bg-blue-500/10 rounded-lg w-fit">
                      <Icon className="w-6 h-6 text-blue-500" />
                    </div>
                    <CardTitle className="text-white">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-slate-400">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Simple, Transparent Pricing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`bg-slate-900 border-slate-800 relative ${
                  plan.popular ? "ring-2 ring-blue-500" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-white">{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">
                      {plan.price}
                    </span>
                    <span className="text-slate-400">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup">
                    <Button
                      className={`w-full ${
                        plan.popular
                          ? "bg-blue-500 hover:bg-blue-600"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                      }`}
                    >
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="container mx-auto px-4 text-center text-slate-400">
          <p>&copy; 2025 RateGuard. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
