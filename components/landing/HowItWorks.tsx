"use client";

import { motion } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { HOW_IT_WORKS_STEPS } from "@/lib/constants";
import { fadeIn, slideIn, staggerContainer } from "@/lib/animations";

/**
 * How It Works Section
 * 3-step process with code examples
 */

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-card/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Get Started in Minutes
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Three simple steps to protect your API calls from rate limits
          </p>
        </motion.div>

        {/* Steps */}
        <div className="max-w-6xl mx-auto space-y-24">
          {HOW_IT_WORKS_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isEven = i % 2 === 0;

            return (
              <motion.div
                key={step.step}
                variants={staggerContainer(0.2, 0)}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.3 }}
                className={`flex flex-col ${
                  isEven ? "lg:flex-row" : "lg:flex-row-reverse"
                } gap-12 items-center`}
              >
                {/* Content */}
                <motion.div
                  variants={slideIn(isEven ? "right" : "left", "spring", 0.2)}
                  className="flex-1"
                >
                  {/* Step number badge */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-foreground text-2xl font-bold shadow-lg">
                      {step.step}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                  </div>

                  <h3 className="text-3xl font-bold text-foreground mb-4">
                    {step.title}
                  </h3>
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>

                  {/* Connection line (desktop only) */}
                  {i < HOW_IT_WORKS_STEPS.length - 1 && (
                    <div className="hidden lg:block mt-12">
                      <div className="w-px h-24 bg-gradient-to-b from-slate-700 to-transparent mx-8" />
                    </div>
                  )}
                </motion.div>

                {/* Code Example */}
                <motion.div
                  variants={slideIn(isEven ? "left" : "right", "spring", 0.4)}
                  className="flex-1 w-full"
                >
                  <div className="relative rounded-xl overflow-hidden border border-border shadow-2xl">
                    {/* Code header */}
                    <div className="bg-card px-4 py-3 flex items-center gap-2 border-b border-border">
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                      </div>
                      <span className="text-xs text-slate-500 ml-2">
                        {step.code.language}
                      </span>
                    </div>

                    {/* Code content */}
                    <div className="bg-[#1e1e1e]">
                      <SyntaxHighlighter
                        language={step.code.language}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          padding: "1.5rem",
                          background: "transparent",
                          fontSize: "0.875rem",
                        }}
                        showLineNumbers={false}
                      >
                        {step.code.snippet}
                      </SyntaxHighlighter>
                    </div>

                    {/* Glow effect */}
                    <div className="absolute -inset-px rounded-xl bg-gradient-to-br from-primary/20 to-chart-2/20 opacity-50 blur-xl -z-10" />
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
