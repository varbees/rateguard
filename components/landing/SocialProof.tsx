"use client";

import { motion } from "framer-motion";
import { VALUE_METRICS } from "@/lib/constants";
import { fadeIn, staggerContainer } from "@/lib/animations";
import { TrendingUp, Zap, Shield, Clock } from "lucide-react";

/**
 * Value Proposition Section
 * Displays real business value metrics instead of superficial social proof
 */

const iconMap = {
  0: TrendingUp,
  1: Zap,
  2: Shield,
  3: Clock,
};

export function ValueProposition() {
  return (
    <section className="py-20 bg-gradient-to-b from-slate-900/50 to-slate-950 border-b border-border">
      <motion.div
        variants={staggerContainer(0.1, 0)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.25 }}
        className="container mx-auto px-4"
      >
        {/* Heading */}
        <motion.div variants={fadeIn("down", 0)} className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Real Value. Real Results.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Not a startup with promises. We deliver measurable business
            outcomes.
          </p>
        </motion.div>

        {/* Metrics Grid */}
        <motion.div
          variants={staggerContainer(0.1, 0.2)}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto"
        >
          {VALUE_METRICS.map((item, i) => {
            const Icon = iconMap[i as keyof typeof iconMap];
            return (
              <motion.div
                key={item.metric}
                variants={fadeIn("up", i * 0.1)}
                whileHover={{ scale: 1.05, y: -5 }}
                className="relative group"
              >
                <div className="p-6 rounded-2xl bg-card/50 backdrop-blur-md border border-border hover:border-border transition-all h-full">
                  {/* Icon */}
                  <div className="mb-4 w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-chart-2/20 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>

                  {/* Metric */}
                  <h3 className="text-2xl font-bold text-foreground mb-2">
                    {item.metric}
                  </h3>

                  {/* Description */}
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </p>

                  {/* Glow on hover */}
                  <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/10 to-chart-2/10 opacity-0 group-hover:opacity-100 blur transition-opacity duration-500 -z-10" />
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Bottom CTA */}
        <motion.p
          variants={fadeIn("up", 0.4)}
          className="text-center mt-12 text-muted-foreground text-sm"
        >
          Built by developers, for developers. Production-ready from day one.
        </motion.p>
      </motion.div>
    </section>
  );
}
