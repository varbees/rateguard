"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, BarChart3, Shield, ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface Step1WelcomeProps {
  onNext: () => void;
  onSkip: () => void;
}

const benefits = [
  {
    icon: Zap,
    title: "Intelligent Rate Limiting",
    description:
      "Multi-tier rate limiting with Redis. Protect your APIs from abuse automatically.",
    color: "text-yellow-600",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description:
      "Track every request with detailed metrics. Know exactly how your APIs are used.",
    color: "text-blue-600",
  },
  {
    icon: Shield,
    title: "CORS & Security",
    description:
      "Per-API CORS whitelisting and AES-256-GCM encryption. Enterprise-grade security.",
    color: "text-green-600",
  },
];

export function Step1Welcome({ onNext, onSkip }: Step1WelcomeProps) {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-medium text-primary">
            Welcome to RateGuard
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Protect Your APIs in <span className="text-primary">3 Minutes</span>
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Set up enterprise-grade rate limiting, analytics, and security for any
          API endpoint. No complex configuration required.
        </p>
      </motion.div>

      {/* Benefits Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid md:grid-cols-3 gap-6"
      >
        {benefits.map((benefit, index) => (
          <motion.div
            key={benefit.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
          >
            <Card className="border-2 h-full hover:shadow-lg transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div
                  className={cn(
                    "p-3 rounded-lg bg-muted/50 w-fit",
                    benefit.color
                  )}
                >
                  <benefit.icon className="size-6" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* CTA Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col sm:flex-row gap-4 justify-center items-center"
      >
        <Button size="lg" onClick={onNext} className="gap-2 px-8">
          Get Started
          <ArrowRight className="size-4" />
        </Button>
        <Button size="lg" variant="ghost" onClick={onSkip}>
          Skip to Dashboard
        </Button>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex flex-wrap justify-center gap-8 pt-8 border-t"
      >
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">2ms</div>
          <div className="text-sm text-muted-foreground">Average Latency</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">99.99%</div>
          <div className="text-sm text-muted-foreground">Uptime SLA</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">10M+</div>
          <div className="text-sm text-muted-foreground">Requests/Day</div>
        </div>
      </motion.div>
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
