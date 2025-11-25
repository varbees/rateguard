"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useDashboardStore } from "@/lib/store"; // Assuming we might use store later, but for now local state is fine

const faqs = [
  {
    question: "Why rate limit management matters?",
    answer: "Because downtime is expensive and sleep is priceless. Also, your database will thank you.",
  },
  {
    question: "Who built this monster?",
    answer: "See the 'Built by Humans' section above. We are real people, mostly.",
  },
  {
    question: "Will it get me fired?",
    answer: "Probably not. In fact, it might get you promoted. But we can't legally promise that.",
    triggerDwight: true,
  },
  {
    question: "Can I self-host?",
    answer: "Yes! Check our Enterprise plan for on-premise options.",
  },
  {
    question: "Is it web scale?",
    answer: "Yes, it is web scale. MongoDB is web scale. Everything is web scale.",
  },
];

export function FAQ() {
  const [dwightMessage, setDwightMessage] = useState<string | null>(null);

  const handleAccordionChange = (value: string) => {
    if (value === "item-2") { // Index of "Will it get me fired?"
      const event = new CustomEvent("dwight-say", { detail: "False." });
      window.dispatchEvent(event);
    }
  };

  return (
    <section className="py-24 bg-muted/30">
      <div className="container px-4 md:px-6 max-w-3xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            And some answers we made up.
          </p>
        </div>

        <Accordion type="single" collapsible onValueChange={handleAccordionChange}>
          {faqs.map((faq, index) => (
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
      </div>
    </section>
  );
}
