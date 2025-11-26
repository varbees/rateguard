"use client";

import { motion } from "framer-motion";
import {
  Server,
  Shield,
  Gauge,
  Timer,
  ArrowRightLeft,
  Activity,
  Zap,
  Cpu,
  Send,
  CheckCircle2,
  BarChart3,
  GitMerge,
} from "lucide-react";

const steps = [
  {
    id: 1,
    title: "Client Request",
    description: "API call arrives at RateGuard edge network",
    icon: Send,
  },
  {
    id: 2,
    title: "Auth & Validation",
    description: "API key verified, user plan checked in <1ms",
    icon: Shield,
  },
  {
    id: 3,
    title: "4-Tier Rate Check",
    description:
      "Per-second, hourly, daily, monthly limits verified concurrently",
    icon: Gauge,
  },
  {
    id: 4,
    title: "Smart Queuing",
    description: "Rate limited? Queued intelligently via FIFO. Never see 429s.",
    icon: Timer,
  },
  {
    id: 5,
    title: "Transparent Proxy",
    description: "Request forwarded to upstream API with custom headers",
    icon: ArrowRightLeft,
  },
  {
    id: 6,
    title: "Analytics & Response",
    description:
      "Metrics recorded via SSE, response streamed back in real-time",
    icon: Activity,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-muted/30">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            How RateGuard Works
            <span className="block text-primary mt-2">
              Your Request&apos;s Journey
            </span>
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl max-w-3xl mx-auto">
            From ingress to response, see exactly what happens when your API
            call flows through RateGuard&apos;s distributed architecture.
          </p>
        </div>

        {/* 6-Step Flow - Refined Design */}
        <div className="relative mb-24">
          {/* Subtle Connecting Line */}
          <div className="absolute top-[72px] left-0 w-full h-px bg-border/50 hidden lg:block" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center group"
              >
                {/* Icon Container - Subtle Design */}
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-center backdrop-blur-sm transition-all duration-300 group-hover:bg-primary/10 group-hover:border-primary/30">
                    <step.icon className="w-9 h-9 text-primary" />
                  </div>

                  {/* Step Number - Minimal Badge */}
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-background border border-border rounded-full flex items-center justify-center text-xs font-mono text-muted-foreground">
                    {step.id}
                  </div>
                </div>

                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Simplified Request Flow Visualization */}
        <div className="relative bg-card/50 border rounded-2xl overflow-hidden p-8 mb-16 backdrop-blur-sm">
          <div className="relative">
            <h3 className="text-2xl font-bold mb-8 text-center">
              Real-Time Request Flow
            </h3>

            {/* Clean Flow Visualization */}
            <div className="flex items-center justify-center gap-6 flex-wrap">
              {/* Client */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-xl bg-background border flex items-center justify-center">
                  <Server className="w-7 h-7 text-muted-foreground" />
                </div>
                <span className="text-xs text-muted-foreground">Client</span>
              </div>

              {/* Arrow */}
              <ArrowRightLeft className="w-5 h-5 text-muted-foreground/50 hidden md:block" />

              {/* RateGuard Core - Subtle Highlight */}
              <motion.div
                animate={{
                  borderColor: [
                    "rgba(59, 130, 246, 0.2)",
                    "rgba(59, 130, 246, 0.4)",
                    "rgba(59, 130, 246, 0.2)",
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity }}
                className="flex flex-col items-center gap-2 px-6 py-4 border rounded-xl bg-primary/5"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-primary/70" />
                  <Gauge className="w-5 h-5 text-primary/70" />
                  <Timer className="w-5 h-5 text-primary/70" />
                </div>
                <span className="text-sm font-semibold">RateGuard Engine</span>
                <span className="text-xs text-muted-foreground">
                  &lt;2ms processing
                </span>
              </motion.div>

              {/* Arrow */}
              <ArrowRightLeft className="w-5 h-5 text-muted-foreground/50 hidden md:block" />

              {/* Upstream API */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-xl bg-background border flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-muted-foreground" />
                </div>
                <span className="text-xs text-muted-foreground">
                  Upstream API
                </span>
              </div>
            </div>

            {/* Stats - Minimal Design */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
              <div className="text-center p-3 rounded-lg bg-background/50 border">
                <div className="text-xl font-bold text-foreground mb-1">6</div>
                <div className="text-xs text-muted-foreground">Steps</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-background/50 border">
                <div className="text-xl font-bold text-foreground mb-1">
                  &lt;2ms
                </div>
                <div className="text-xs text-muted-foreground">Latency</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-background/50 border">
                <div className="text-xl font-bold text-foreground mb-1">
                  100k+
                </div>
                <div className="text-xs text-muted-foreground">RPS</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-background/50 border">
                <div className="text-xl font-bold text-foreground mb-1">0</div>
                <div className="text-xs text-muted-foreground">429 Errors</div>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Deep Dive - Clean Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
          <div className="space-y-6">
            <h3 className="text-3xl font-bold">The Multi-Tier Architecture</h3>
            <p className="text-muted-foreground leading-relaxed">
              Traditional rate limiters check one limit and call it a day.
              RateGuard runs{" "}
              <strong className="text-foreground">4 concurrent checks</strong>{" "}
              across different time scales — per-second for burst protection,
              hourly for traffic shaping, daily for quota enforcement, and
              monthly for billing accuracy.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Our{" "}
              <strong className="text-foreground">
                Redis-backed distributed system
              </strong>{" "}
              coordinates rate limits across unlimited instances. Whether
              you&apos;re running 3 pods or 300, users see consistent limits
              across all nodes. Atomic Lua scripts prevent race conditions while
              maintaining sub-5ms latency.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              When limits are hit, requests don&apos;t fail — they{" "}
              <strong className="text-foreground">queue intelligently</strong>{" "}
              using FIFO with configurable timeouts. Circuit breakers protect
              against cascade failures when upstream APIs go down, automatically
              recovering when services heal. Kubernetes-native health checks
              ensure zero-downtime deployments with graceful shutdown.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 bg-card border rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Latency</span>
                </div>
                <p className="text-2xl font-mono font-bold">&lt; 2ms</p>
              </div>
              <div className="p-4 bg-card border rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Throughput</span>
                </div>
                <p className="text-2xl font-mono font-bold">100k+</p>
              </div>
            </div>
          </div>

          {/* Key Features - Minimal Cards */}
          <div className="space-y-3">
            <h3 className="text-2xl font-bold mb-6">Why It&apos;s Different</h3>

            {[
              {
                icon: Shield,
                title: "Zero Trust Authentication",
                description:
                  "Every request verified before touching rate limits",
              },
              {
                icon: Gauge,
                title: "Distributed Rate Limiting",
                description:
                  "Redis-backed coordination across unlimited instances",
              },
              {
                icon: Activity,
                title: "Circuit Breaker Protection",
                description:
                  "Auto-failover when upstream APIs fail, graceful recovery",
              },
              {
                icon: Timer,
                title: "Zero-Downtime Deployments",
                description:
                  "Kubernetes /health and /ready probes, graceful shutdown",
              },
              {
                icon: GitMerge,
                title: "Auto-Discovery",
                description:
                  "Learns API limits from 429 responses automatically",
              },
              {
                icon: BarChart3,
                title: "Real-Time Analytics",
                description: "SSE-powered streaming metrics, no polling",
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                viewport={{ once: true }}
                className="flex gap-3 items-start p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                  <feature.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">
                    {feature.title}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
