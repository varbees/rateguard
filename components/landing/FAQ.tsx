"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const faqs = [
  {
    question: "Why rate limit management matters?",
    answer:
      "Because downtime is expensive and sleep is priceless. Also, your database will thank you.",
    category: "General",
  },
  {
    question: "Who built this monster?",
    answer:
      "See the 'Built by Humans' section above. We are real people, mostly.",
    category: "General",
  },
  {
    question: "Will it get me fired?",
    answer:
      "Probably not. In fact, it might get you promoted. But we can't legally promise that.",
    triggerDwight: true,
    category: "Humor",
  },
  {
    question: "Can I self-host?",
    answer: "Yes! Check our Enterprise plan for on-premise options.",
    category: "Technical",
  },
  {
    question: "Is it web scale?",
    answer:
      "Yes, it is web scale. MongoDB is web scale. Everything is web scale.",
    category: "Humor",
  },
  {
    question: "How does the concurrent aggregation work?",
    answer:
      "We use a distributed counter system that syncs across nodes using a gossip protocol (or Redis, depending on your config). It ensures that 10k requests/s from 5 different regions are counted accurately without locking your database.",
    category: "Technical",
  },
  {
    question: "What about latency?",
    answer:
      "We add <2ms of overhead. You won't even notice we're there. We're like a ninja, but for HTTP headers.",
    category: "Technical",
  },
  {
    question: "Is my data safe?",
    answer:
      "We only store metadata (counts, keys). Your actual request payloads pass through our transparent proxy and are never stored. We don't want your data, we have enough of our own.",
    category: "Security",
  },
  {
    question: "How does horizontal scaling work?",
    answer:
      "Our Redis-backed distributed rate limiting coordinates limits across all your instances. Whether you run 3 pods or 300, your users see consistent rate limits. No more '3x instances = 3x limits' problems.",
    category: "Technical",
  },
  {
    question: "What happens when an upstream API fails?",
    answer:
      "Circuit breakers automatically open after 5 consecutive failures, failing fast to protect your infrastructure. After 60 seconds, we test recovery with limited requests. If successful, the circuit closes automatically. No hammering dead APIs.",
    category: "Technical",
  },
  {
    question: "Can I deploy without downtime?",
    answer:
      "Absolutely. We have Kubernetes-native /health and /ready endpoints. During deployments, we gracefully drain in-flight requests (30s timeout) before shutting down. Zero dropped requests guaranteed.",
    category: "Technical",
  },
  {
    question: "Do you support Kubernetes?",
    answer:
      "Yes! We're Kubernetes-native with proper liveness and readiness probes. Health checks monitor database and Redis connectivity. Rolling updates work seamlessly with our graceful shutdown.",
    category: "Technical",
  },
];

export function FAQ() {
  const [searchQuery, setSearchQuery] = useState("");

  const handleAccordionChange = (value: string) => {
    // Find the FAQ item based on the index (value is "item-{index}")
    const index = parseInt(value.split("-")[1]);
    const faq = filteredFaqs[index];

    if (faq && faq.triggerDwight) {
      const event = new CustomEvent("dwight-say", { detail: "False." });
      window.dispatchEvent(event);
    }
  };

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section className="py-24 bg-muted/30">
      <div className="container max-w-4xl mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            And some answers we made up.
          </p>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for answers..."
            className="pl-10 h-12 text-lg bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {filteredFaqs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No answers found. Maybe ask Dwight?</p>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            onValueChange={handleAccordionChange}
          >
            {filteredFaqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </section>
  );
}
