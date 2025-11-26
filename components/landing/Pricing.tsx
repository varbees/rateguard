"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "For hobbyists and people who break things.",
    features: [
      "10k requests/month",
      "Basic rate limiting",
      "Community support",
      "1 API Key",
    ],
    cta: "Start Breaking Things",
    popular: false,
  },
  {
    name: "Pro",
    price: "$49",
    description: "For devs who deploy at midnight.",
    features: [
      "1M requests/month",
      "Advanced rate limiting",
      "Priority support",
      "Unlimited API Keys",
      "Billing Integration",
    ],
    cta: "Deploy at Midnight",
    popular: true,
  },
  {
    name: "Business",
    price: "$199",
    description: "For when your CTO starts asking questions.",
    features: [
      "Unlimited requests",
      "Custom contracts",
      "Dedicated support",
      "SLA 99.99%",
      "On-premise option",
    ],
    cta: "Make CTO Happy",
    popular: false,
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-24">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Simple Pricing
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            No upsell popups. No "Contact sales" (unless you want to).
          </p>

          <div className="flex items-center justify-center mt-8 gap-4">
            <span className={!annual ? "font-bold" : "text-muted-foreground"}>
              Monthly
            </span>
            <Switch checked={annual} onCheckedChange={setAnnual} />
            <span className={annual ? "font-bold" : "text-muted-foreground"}>
              Yearly{" "}
              <span className="text-xs text-green-500 font-normal">
                (Save 20%)
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              className={`relative p-8 rounded-2xl border flex flex-col items-center text-center ${
                plan.popular
                  ? "bg-card shadow-2xl border-primary ring-2 ring-primary/20 scale-105 z-10"
                  : "bg-background/50 hover:bg-card/80 transition-colors"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-bold">
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <p className="text-muted-foreground mt-2 text-sm h-10">
                  {plan.description}
                </p>
              </div>

              <div className="mb-8">
                <span className="text-4xl font-bold">
                  {annual && plan.price !== "$0"
                    ? `$${parseInt(plan.price.slice(1)) * 0.8 * 12}`
                    : plan.price}
                </span>
                <span className="text-muted-foreground">
                  /{annual ? "year" : "month"}
                </span>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full ${
                  plan.popular
                    ? "bg-primary"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
                size="lg"
              >
                {plan.cta}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
