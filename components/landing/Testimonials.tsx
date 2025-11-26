"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const testimonials = [
  {
    quote:
      "I slept like a baby after switching to RateGuard. Before, I was waking up every hour to check the logs.",
    author: "Sarah J.",
    role: "Lead Dev @ TechCorp",
    avatar: "SJ",
  },
  {
    quote:
      "RateGuard gave me a raise. Well, not directly, but my boss was impressed I fixed the billing issue.",
    author: "Mike R.",
    role: "Senior Engineer",
    avatar: "MR",
  },
  {
    quote:
      "Finally, a rate limiter that doesn't require a PhD to configure. It just works.",
    author: "Alex T.",
    role: "CTO @ StartupX",
    avatar: "AT",
  },
];

export function Testimonials() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            In Their Own Words
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            (We didn't pay them to say this. We promise.)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-card p-8 rounded-2xl border shadow-sm relative flex flex-col items-center text-center"
            >
              <Quote className="absolute top-8 right-8 w-8 h-8 text-primary/10 hidden md:block" />
              <p className="text-lg mb-8 relative z-10">"{t.quote}"</p>
              <div className="flex flex-col items-center gap-4">
                <Avatar>
                  <AvatarFallback>{t.avatar}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-bold">{t.author}</div>
                  <div className="text-sm text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
