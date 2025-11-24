"use client";

import { motion } from "framer-motion";
import { FEATURES } from "@/lib/constants";
import { fadeIn, staggerContainer, cardHover } from "@/lib/animations";

/**
 * Features Section
 * 6 feature cards with glassmorphism design and animations
 */

export function Features() {
  return (
    <section id="features" className="py-24 bg-background">
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
            Everything You Need to Scale
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Production-grade features designed for developers who build at scale
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          variants={staggerContainer(0.1, 0.2)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={fadeIn("up", i * 0.1)}
                whileHover="hover"
                initial="rest"
                className="group"
              >
                <motion.div
                  variants={cardHover}
                  className="relative h-full p-8 rounded-2xl bg-card/50 backdrop-blur-md border border-border hover:border-primary/50 transition-colors"
                >
                  {/* Gradient background on hover */}
                  <div
                    className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-gradient-to-br ${feature.gradient}`}
                  />

                  {/* Icon */}
                  <div
                    className={`relative mb-6 w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} p-3 shadow-lg`}
                  >
                    <Icon className="w-full h-full text-primary-foreground" />
                  </div>

                  {/* Content */}
                  <div className="relative">
                    <h3 className="text-xl font-bold text-foreground mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                      {feature.description}
                    </p>
                    {/* Monetization Value */}
                    <div className="pt-4 border-t border-border/50">
                      <p className="text-sm text-primary font-medium">
                        💰 {feature.monetizationValue}
                      </p>
                    </div>
                  </div>

                  {/* Hover glow effect */}
                  <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/20 to-chart-2/20 opacity-0 group-hover:opacity-100 blur transition-opacity duration-500 -z-10" />
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
