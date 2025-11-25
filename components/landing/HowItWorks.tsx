"use client";

import { motion } from "framer-motion";
import { Server, Shield, Database, Activity, ArrowRight } from "lucide-react";

const steps = [
  {
    id: 1,
    title: "Your Requests",
    description: "API traffic hits our transparent proxy.",
    icon: Activity,
    color: "bg-blue-500",
  },
  {
    id: 2,
    title: "The Guard",
    description: "5-tier rate limiting checks in <2ms.",
    icon: Shield,
    color: "bg-green-500",
  },
  {
    id: 3,
    title: "Billing & Analytics",
    description: "Usage tracked, keys validated, bills calculated.",
    icon: Database,
    color: "bg-purple-500",
  },
  {
    id: 4,
    title: "Your Backend",
    description: "Clean, safe traffic reaches your servers.",
    icon: Server,
    color: "bg-orange-500",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-muted/30">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            How RateGuard Works
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            Your requests, our proxy, 5-tier limits, encrypted keys, chill billing.
          </p>
        </div>

        <div className="relative">
          {/* Connecting Line */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2 hidden md:block" />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.2 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center group"
              >
                <div className={`w-16 h-16 rounded-2xl ${step.color} bg-opacity-10 flex items-center justify-center mb-6 relative transition-transform group-hover:scale-110 duration-300 shadow-lg`}>
                  <step.icon className={`w-8 h-8 text-white`} />
                  <div className={`absolute inset-0 ${step.color} opacity-20 blur-xl rounded-full`} />
                </div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-20 p-8 rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 flex-1">
              <h3 className="text-2xl font-bold">Architecture That Scales</h3>
              <p className="text-muted-foreground">
                We built RateGuard on a distributed edge network. It's not just a proxy; 
                it's a global shield for your API infrastructure.
              </p>
              <ul className="space-y-2">
                {["Global Edge Network", "Sub-millisecond Latency", "99.99% Uptime SLA"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full h-64 bg-muted/50 rounded-xl flex items-center justify-center border border-dashed">
              <span className="text-muted-foreground font-mono text-sm">
                [Interactive Architecture Diagram Placeholder]
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
