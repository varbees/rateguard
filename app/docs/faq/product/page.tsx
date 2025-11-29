import { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Product FAQ | RateGuard Documentation",
  description: "Frequently asked questions about RateGuard.",
};

export default function ProductFaqPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <HelpCircle className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Product FAQ
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              You have questions. We have answers. (Mostly).
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="latency">
            <AccordionTrigger>Does RateGuard add latency?</AccordionTrigger>
            <AccordionContent>
              Technically, yes. Everything adds latency. But we're talking about milliseconds. Our edge proxies are optimized for speed, and we usually add less than 20ms to your request time.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="uptime">
            <AccordionTrigger>What is your uptime guarantee?</AccordionTrigger>
            <AccordionContent>
              For Enterprise plans, we offer a 99.99% SLA. For other plans, we aim for 100%, but we promise 99.9%.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="data-privacy">
            <AccordionTrigger>Do you store my API data?</AccordionTrigger>
            <AccordionContent>
              We store metadata (headers, timestamps, token counts) for analytics. We do NOT store request or response bodies unless you explicitly enable "Debug Mode" for troubleshooting.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="streaming">
            <AccordionTrigger>Do you support streaming?</AccordionTrigger>
            <AccordionContent>
              Yes! We support Server-Sent Events (SSE) for LLM streaming. We count tokens on the fly without buffering the entire response.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
