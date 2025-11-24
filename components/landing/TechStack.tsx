"use client";

import { motion } from "framer-motion";
import { TECH_STACK } from "@/lib/constants";
import { fadeIn, staggerContainer } from "@/lib/animations";

/**
 * Tech Stack Section
 * Displays technology badges with animations
 */

export function TechStack() {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Built with Modern Technology
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Powered by industry-leading tools and frameworks
          </p>
        </motion.div>

        {/* Tech Badges */}
        <motion.div
          variants={staggerContainer(0.08, 0.2)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto"
        >
          {TECH_STACK.map((tech, i) => (
            <motion.div
              key={tech.name}
              variants={fadeIn("up", i * 0.05)}
              whileHover={{
                scale: 1.1,
                y: -5,
                transition: { duration: 0.2 },
              }}
            >
              <div
                className={`px-6 py-3 rounded-full ${tech.color} bg-opacity-20 border border-white/10 backdrop-blur-sm hover:border-white/30 transition-all cursor-pointer`}
              >
                <span className="text-foreground font-medium text-sm">
                  {tech.name}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
