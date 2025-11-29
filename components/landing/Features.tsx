"use client";

import { motion } from "framer-motion";
import {
  Shield,
  Zap,
  CreditCard,
  Lock,
  Globe,
  Bot,
  AlertTriangle,
  Layers,
  TrendingUp,
  Activity,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    title: "Transparent Proxy",
    description:
      "Drop-in replacement for your current setup. No code changes needed.",
    icon: Shield,
    joke: "That's what she said (about the drop-in part).",
  },
  {
    title: "Multi-Tier Rate Limiting",
    description:
      "Granular control with per-second, hourly, daily, and monthly limits. Prevent API abuse at every time scale.",
    icon: Zap,
    joke: "More time windows than a DeLorean.",
  },
  {
    title: "LLM Token Tracking",
    description:
      "Automatic token counting for OpenAI, Anthropic, Groq, and Cohere. Real-time cost tracking with per-model breakdowns.",
    icon: Zap,
    joke: "We count tokens so you don't have to.",
    highlight: true,
  },
  {
    title: "Intelligent Auto-Detection",
    description:
      "Automatically identifies LLM APIs from URL patterns and response structure. Zero configuration needed for token tracking.",
    icon: Bot,
    joke: "It's not magic, it's pattern matching (but feels like magic).",
    highlight: true,
  },
  {
    title: "Dual Pricing Model",
    description:
      "Request-based pricing for traditional APIs, token-based pricing for LLMs. Get accurate costs for both in one dashboard.",
    icon: CreditCard,
    joke: "Two pricing models walk into a bar...",
    highlight: true,
  },
  {
    title: "Priority Queue Management",
    description:
      "Redis-backed priority queue. VIP users jump the line, ensuring critical traffic always gets through during congestion.",
    icon: Layers,
    joke: "Like a bouncer for your APIs, but polite.",
  },
  {
    title: "Rate Limit Discovery",
    description:
      "Automatically learns upstream API limits from responses. Self-tuning system that optimizes over time.",
    icon: TrendingUp,
    joke: "It's like having a psychic for your rate limits.",
  },
  {
    title: "Webhook Relay & Retries",
    description:
      "Reliable event delivery with automatic retries, dead letter queues, and full delivery history. Never miss a webhook.",
    icon: Activity,
    joke: "We deliver better than your local pizza place.",
  },
  {
    title: "Real-Time Analytics",
    description:
      "Live streaming metrics powered by WebSocket. Monitor API health, latency, errors, and LLM token usage as they happen.",
    icon: Activity,
    joke: "Stonks only go up (we hope).",
  },


  {
    title: "Automated Billing",
    description:
      "Stripe & Razorpay integration. We count the requests, you get the money.",
    icon: CreditCard,
    joke: "Making it rain, digitally speaking.",
  },
  {
    title: "Plan Enforcement",
    description: "Strict limits for free users, VIP treatment for enterprise.",
    icon: AlertTriangle,
    joke: "You shall not pass!",
  },
  {
    title: "Distributed Rate Limiting",
    description:
      "Redis-backed coordination across unlimited instances. Scale horizontally without multiplying rate limits.",
    icon: Layers,
    joke: "One limit to rule them all.",
  },
  {
    title: "Circuit Breaker Protection",
    description:
      "Automatic failover when upstream APIs fail. Stop hammering failing services and recover gracefully.",
    icon: Activity,
    joke: "We break circuits, not promises.",
  },
  {
    title: "Zero-Downtime Deployments",
    description:
      "Kubernetes-native health checks and graceful shutdown. Deploy fearlessly with /health and /ready probes.",
    icon: Shield,
    joke: "Sleep well, ops team.",
  },

  {
    title: "Budget Alerts & Cost Optimization",
    description:
      "Get notified when you hit 90% of your budget. Smart suggestions to switch models and save money.",
    icon: AlertTriangle,
    joke: "Your wallet will thank you.",
    comingSoon: true,
  },
  {
    title: "Analytics API",
    description:
      "Programmatic access to your cost data, token usage, and error rates. Build your own internal dashboards.",
    icon: Activity,
    joke: "For when you love JSON more than people.",
    comingSoon: true,
  },
  {
    title: "Multi-Provider Support",
    description:
      "Support for Mistral, Together, Replicate, Perplexity, DeepSeek, and Fireworks. 10+ providers total.",
    icon: Layers,
    joke: "Gotta catch 'em all!",
    comingSoon: true,
  },
];

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Everything You Need
            <span className="block text-primary mt-2">
              Nothing You Don&apos;t.
            </span>
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl max-w-3xl mx-auto">
            We stripped away the enterprise bloat and kept the stuff that
            actually matters. No fluff. No vaporware. Just battle-tested
            features that work.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <TooltipProvider>
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className="group relative p-6 bg-card rounded-xl border hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                {feature.comingSoon && (
                  <Badge
                    variant="secondary"
                    className="absolute top-4 right-4 text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
                  >
                    Coming Soon
                  </Badge>
                )}
                {feature.highlight && (
                  <Badge
                    variant="secondary"
                    className="absolute top-4 right-4 text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 animate-pulse"
                  >
                    New
                  </Badge>
                )}
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {feature.description}
                </p>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-xs text-muted-foreground/50 hover:text-primary transition-colors italic">
                      Wait, what?
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{feature.joke}</p>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            ))}
          </TooltipProvider>
        </div>
      </div>
    </section>
  );
}
