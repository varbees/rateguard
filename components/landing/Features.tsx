"use client";

import { motion } from "framer-motion";
import { 
  Shield, 
  Zap, 
  CreditCard, 
  Lock, 
  Globe, 
  BarChart3,
  Bot,
  AlertTriangle
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const features = [
  {
    title: "Transparent Proxy",
    description: "Drop-in replacement for your current setup. No code changes needed.",
    icon: Shield,
    joke: "That's what she said (about the drop-in part).",
  },
  {
    title: "5-Tier Rate Limiting",
    description: "Fixed window, sliding window, token bucket, leaky bucket, and 'panic mode'.",
    icon: Zap,
    joke: "More buckets than a KFC family feast.",
  },
  {
    title: "Automated Billing",
    description: "Stripe & Razorpay integration. We count the requests, you get the money.",
    icon: CreditCard,
    joke: "Making it rain, digitally speaking.",
  },
  {
    title: "End-to-End Encryption",
    description: "Your keys are encrypted at rest, in transit, and in our dreams.",
    icon: Lock,
    joke: "Sealed tighter than a pickle jar.",
  },
  {
    title: "Geo-Currency Detection",
    description: "Charge users in their local currency. Global domination made easy.",
    icon: Globe,
    joke: "Mr. Worldwide.",
  },
  {
    title: "Usage Analytics",
    description: "Real-time charts that make you look smart in board meetings.",
    icon: BarChart3,
    joke: "Stonks only go up.",
  },
  {
    title: "Quirky Support Bot",
    description: "Dwight Schrute, API Assistant. He takes his job very seriously.",
    icon: Bot,
    joke: "Identity theft is not a joke, Jim!",
  },
  {
    title: "Plan Enforcement",
    description: "Strict limits for free users, VIP treatment for enterprise.",
    icon: AlertTriangle,
    joke: "You shall not pass!",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Everything You Need
            <span className="block text-primary mt-2">Nothing You Don't.</span>
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl max-w-2xl mx-auto">
            We stripped away the enterprise bloat and kept the stuff that actually matters.
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
