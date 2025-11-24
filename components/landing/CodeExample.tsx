"use client";

import { motion } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { ArrowRight, CheckCircle, XCircle } from "lucide-react";
import { CODE_EXAMPLE } from "@/lib/constants";
import { fadeIn, slideIn, staggerContainer } from "@/lib/animations";

/**
 * Code Example Section
 * Before/After comparison with syntax highlighting
 */

export function CodeExample() {
  return (
    <section className="py-24 bg-background">
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
            See the Difference
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            One URL change protects you from rate limit errors forever
          </p>
        </motion.div>

        {/* Before/After Comparison */}
        <motion.div
          variants={staggerContainer(0.2, 0.2)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="max-w-7xl mx-auto"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Before */}
            <motion.div variants={slideIn("right", "spring", 0.2)}>
              <div className="relative">
                {/* Badge */}
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <h3 className="text-xl font-bold text-foreground">
                    {CODE_EXAMPLE.before.title}
                  </h3>
                </div>

                {/* Code Block */}
                <div className="relative rounded-xl overflow-hidden border border-red-500/30 shadow-2xl">
                  {/* Header */}
                  <div className="bg-card px-4 py-3 flex items-center gap-2 border-b border-border">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="text-xs text-slate-500 ml-2">
                      {CODE_EXAMPLE.before.language}
                    </span>
                  </div>

                  {/* Code */}
                  <div className="bg-[#1e1e1e]">
                    <SyntaxHighlighter
                      language={CODE_EXAMPLE.before.language}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: "1.5rem",
                        background: "transparent",
                        fontSize: "0.875rem",
                      }}
                      showLineNumbers={true}
                    >
                      {CODE_EXAMPLE.before.code}
                    </SyntaxHighlighter>
                  </div>

                  {/* Error indicator */}
                  <div className="absolute top-0 right-0 m-4 px-3 py-1 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-xs font-medium">
                    ❌ Rate Limit Errors
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Arrow (desktop) */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center shadow-2xl">
                <ArrowRight className="w-8 h-8 text-foreground" />
              </div>
            </motion.div>

            {/* After */}
            <motion.div variants={slideIn("left", "spring", 0.4)}>
              <div className="relative">
                {/* Badge */}
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-chart-3" />
                  <h3 className="text-xl font-bold text-foreground">
                    {CODE_EXAMPLE.after.title}
                  </h3>
                </div>

                {/* Code Block */}
                <div className="relative rounded-xl overflow-hidden border border-green-500/30 shadow-2xl">
                  {/* Header */}
                  <div className="bg-card px-4 py-3 flex items-center gap-2 border-b border-border">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="text-xs text-slate-500 ml-2">
                      {CODE_EXAMPLE.after.language}
                    </span>
                  </div>

                  {/* Code */}
                  <div className="bg-[#1e1e1e]">
                    <SyntaxHighlighter
                      language={CODE_EXAMPLE.after.language}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: "1.5rem",
                        background: "transparent",
                        fontSize: "0.875rem",
                      }}
                      showLineNumbers={true}
                    >
                      {CODE_EXAMPLE.after.code}
                    </SyntaxHighlighter>
                  </div>

                  {/* Success indicator */}
                  <div className="absolute top-0 right-0 m-4 px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400 text-xs font-medium">
                    ✓ Protected
                  </div>

                  {/* Glow effect */}
                  <div className="absolute -inset-px rounded-xl bg-gradient-to-br from-green-500/20 to-blue-500/20 opacity-50 blur-xl -z-10" />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
