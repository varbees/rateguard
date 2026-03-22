"use client";

import { motion } from "framer-motion";
import { Activity, Shield, Zap } from "lucide-react";

const proofPoints = [
  {
    title: "No traffic reroute",
    description:
      "Embed middleware in the app you already run and keep the current control path intact.",
  },
  {
    title: "Preset-driven guardrails",
    description:
      "Use dev, standard, high-throughput, llm-heavy, or strict-upstream-protection presets to set policy defaults.",
  },
  {
    title: "Realtime visibility",
    description:
      "See requests, circuit breakers, queues, token budgets, and event replay in the dashboard and stream feeds.",
  },
];

const icons = [Shield, Zap, Activity];

export function Testimonials() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Why Developers Use RateGuard
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            Clear guardrails, realtime visibility, and no traffic reroute.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {proofPoints.map((point, index) => {
            const Icon = icons[index];
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-card p-8 rounded-2xl border shadow-sm relative flex flex-col items-center text-center"
              >
                <Icon className="absolute top-8 right-8 w-8 h-8 text-primary/10 hidden md:block" />
                <p className="text-lg mb-4 relative z-10 font-semibold">
                  {point.title}
                </p>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {point.description}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
