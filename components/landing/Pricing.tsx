"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PRICING_PLANS } from "@/lib/constants";
import { fadeIn, staggerContainer, cardHover } from "@/lib/animations";

/**
 * Pricing Section
 * 3-tier pricing with hover effects and animations
 */

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-card/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Start free, scale as you grow. No hidden fees, no surprises.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <motion.div
          variants={staggerContainer(0.15, 0.2)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto"
        >
          {PRICING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              variants={fadeIn("up", i * 0.1)}
              whileHover="hover"
              initial="rest"
              className={`relative ${plan.popular ? "md:-mt-4" : ""}`}
            >
              <motion.div
                variants={cardHover}
                className={`relative h-full p-8 rounded-2xl backdrop-blur-md transition-all duration-300 ${
                  plan.popular
                    ? "bg-card border-2 border-blue-500 shadow-2xl shadow-blue-500/20"
                    : "bg-card/50 border border-border hover:border-border"
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-chart-2 rounded-full text-foreground text-sm font-bold shadow-lg">
                      <Sparkles className="w-4 h-4" />
                      {plan.highlight}
                    </div>
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-foreground mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {plan.description}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-foreground">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-muted-foreground">{plan.period}</span>
                    )}
                  </div>
                </div>

                {/* Features List */}
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <Check className="w-5 h-5 text-chart-3 flex-shrink-0" />
                      </div>
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Link href="/signup" className="block">
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? "bg-gradient-to-r from-primary to-chart-2 hover:from-blue-600 hover:to-purple-600 text-foreground shadow-lg shadow-blue-500/30"
                        : "bg-accent hover:bg-slate-700 text-muted-foreground"
                    }`}
                    size="lg"
                  >
                    {plan.cta}
                  </Button>
                </Link>

                {/* Glow effect for popular plan */}
                {plan.popular && (
                  <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/30 to-chart-2/30 opacity-50 blur-2xl -z-10" />
                )}
              </motion.div>
            </motion.div>
          ))}
        </motion.div>

        {/* Enterprise Note */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center text-muted-foreground mt-12"
        >
          All plans include 99.9% uptime SLA and 24/7 monitoring.{" "}
          <Link
            href="/contact"
            className="text-primary hover:text-blue-300 underline"
          >
            Need a custom plan?
          </Link>
        </motion.p>
      </div>
    </section>
  );
}
