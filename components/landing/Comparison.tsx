"use client";

import { motion } from "framer-motion";
import { Check, X, Sparkles } from "lucide-react";

const competitors = [
  { name: "RateGuard", highlight: true },
  { name: "Portkey", highlight: false },
  { name: "AWS API Gateway", highlight: false },
  { name: "Kong", highlight: false },
];

const features = [
  {
    name: "Rate Limiting",
    rateGuard: true,
    portkey: false,
    aws: true,
    kong: true,
  },
  {
    name: "Token Tracking",
    rateGuard: true,
    portkey: true,
    aws: false,
    kong: true,
  },
  {
    name: "Dual Pricing (Cost + Usage)",
    rateGuard: true,
    portkey: false,
    aws: false,
    kong: false,
  },
  {
    name: "Circuit Breaker",
    rateGuard: true,
    portkey: false,
    aws: false,
    kong: true,
  },
  {
    name: "Real-time Dashboard",
    rateGuard: true,
    portkey: true,
    aws: false,
    kong: true,
  },
  {
    name: "Setup in 5 minutes",
    rateGuard: true,
    portkey: false,
    aws: false,
    kong: false,
  },
  {
    name: "LLM Token Counting",
    rateGuard: true,
    portkey: true,
    aws: false,
    kong: false,
  },
  {
    name: "Distributed Rate Limiting",
    rateGuard: true,
    portkey: false,
    aws: true,
    kong: true,
  },
  {
    name: "Priority Queuing",
    rateGuard: true,
    portkey: false,
    aws: false,
    kong: false,
  },
  {
    name: "Webhook Relay & Retries",
    rateGuard: true,
    portkey: false,
    aws: false,
    kong: false,
  },
];

function CheckMark({ isRateGuard = false }: { isRateGuard?: boolean }) {
  return (
    <div className="flex items-center justify-center">
      <Check 
        className={`w-5 h-5 ${
          isRateGuard 
            ? "text-green-500" 
            : "text-green-500/50"
        }`} 
      />
    </div>
  );
}

function CrossMark() {
  return (
    <div className="flex items-center justify-center">
      <X className="w-5 h-5 text-red-500/30" />
    </div>
  );
}

export function Comparison() {
  return (
    <section className="py-24 bg-background">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">
              The Honest Comparison
            </span>
          </motion.div>
          
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">
            We&apos;re Not Just Another Gateway
          </h2>
          <p className="text-muted-foreground md:text-xl max-w-3xl mx-auto">
            See how RateGuard stacks up against the competition. Spoiler: We actually do what we promise.
          </p>
        </div>

        {/* Mobile Swipe Hint */}
        <div className="md:hidden text-center mb-4">
          <p className="text-sm text-muted-foreground">
            👈 Swipe horizontally to compare →
          </p>
        </div>

        {/* Comparison Table */}
        <div className="relative">
          {/* Gradient overlays for scroll indication */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none md:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none md:hidden" />

          <div className="overflow-x-auto scrollbar-hide">
            <div className="inline-block min-w-full align-middle">
              <div className="overflow-hidden border rounded-2xl">
                <table className="min-w-full divide-y divide-border">
                  {/* Table Header - Sticky */}
                  <thead className="bg-muted/30 sticky top-0 z-20">
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 z-30 bg-muted/30 backdrop-blur-sm px-6 py-4 text-left text-sm font-semibold min-w-[200px]"
                      >
                        Feature
                      </th>
                      {competitors.map((competitor) => (
                        <th
                          key={competitor.name}
                          scope="col"
                          className={`px-6 py-4 text-center text-sm font-semibold min-w-[140px] ${
                            competitor.highlight
                              ? "bg-primary/10 border-x-2 border-primary/20"
                              : ""
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            {competitor.highlight && (
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                            )}
                            <span
                              className={
                                competitor.highlight
                                  ? "text-primary font-bold"
                                  : "text-muted-foreground"
                              }
                            >
                              {competitor.name}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody className="divide-y divide-border bg-card">
                    {features.map((feature, index) => (
                      <motion.tr
                        key={feature.name}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        viewport={{ once: true }}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="sticky left-0 z-10 bg-card backdrop-blur-sm px-6 py-4 text-sm font-medium border-r">
                          {feature.name}
                        </td>
                        <td className="px-6 py-4 bg-primary/5 border-x-2 border-primary/20">
                          {feature.rateGuard ? (
                            <CheckMark isRateGuard />
                          ) : (
                            <CrossMark />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {feature.portkey ? <CheckMark /> : <CrossMark />}
                        </td>
                        <td className="px-6 py-4">
                          {feature.aws ? <CheckMark /> : <CrossMark />}
                        </td>
                        <td className="px-6 py-4">
                          {feature.kong ? <CheckMark /> : <CrossMark />}
                        </td>
                      </motion.tr>
                    ))}

                    {/* Summary Row */}
                    <tr className="bg-muted/50 font-semibold">
                      <td className="sticky left-0 z-10 bg-muted/50 backdrop-blur-sm px-6 py-4 text-sm border-r">
                        Total Features
                      </td>
                      <td className="px-6 py-4 text-center bg-primary/10 border-x-2 border-primary/20">
                        <span className="text-primary text-lg font-bold">
                          {features.filter((f) => f.rateGuard).length}/
                          {features.length}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-muted-foreground">
                        {features.filter((f) => f.portkey).length}/
                        {features.length}
                      </td>
                      <td className="px-6 py-4 text-center text-muted-foreground">
                        {features.filter((f) => f.aws).length}/{features.length}
                      </td>
                      <td className="px-6 py-4 text-center text-muted-foreground">
                        {features.filter((f) => f.kong).length}/
                        {features.length}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <p className="text-muted-foreground mb-4">
            Ready to switch to something that actually works?
          </p>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold"
          >
            See Pricing
            <Sparkles className="w-4 h-4" />
          </a>
        </motion.div>

        {/* Fine Print */}
        <p className="text-xs text-muted-foreground text-center mt-8 max-w-2xl mx-auto">
          * Comparison based on publicly available features as of November 2024. 
          We update this regularly to stay honest. Find an error?{" "}
          <a href="mailto:hello@rateguard.io" className="underline">
            Let us know
          </a>
          .
        </p>
      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}
