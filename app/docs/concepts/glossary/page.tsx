import { Metadata } from "next";
import { FileText } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Glossary | RateGuard Documentation",
  description: "Definitions of common terms used in RateGuard.",
};

export default function GlossaryPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <FileText className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Glossary
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Words are hard. Here's what they mean in the RateGuard universe.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="api-key">
            <AccordionTrigger>API Key</AccordionTrigger>
            <AccordionContent>
              A unique string that identifies your application or user. You send this in the `X-RG-Key` header (or `Authorization` header) to authenticate with RateGuard.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="circuit-breaker">
            <AccordionTrigger>Circuit Breaker</AccordionTrigger>
            <AccordionContent>
              A safety mechanism that stops sending requests to a failing upstream service. It has three states: Closed (normal), Open (blocking requests), and Half-Open (testing recovery).
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="dual-pricing">
            <AccordionTrigger>Dual Pricing</AccordionTrigger>
            <AccordionContent>
              A billing model where you are charged based on both the number of requests and the number of tokens (for LLMs) consumed.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="edge-proxy">
            <AccordionTrigger>Edge Proxy</AccordionTrigger>
            <AccordionContent>
              A server located close to the user that intercepts requests and forwards them to the destination. RateGuard uses edge proxies to minimize latency.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="rate-limit">
            <AccordionTrigger>Rate Limit</AccordionTrigger>
            <AccordionContent>
              The maximum number of requests a user can make within a specific time window (e.g., 100 requests per minute).
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="token">
            <AccordionTrigger>Token</AccordionTrigger>
            <AccordionContent>
              The basic unit of text used by LLMs (Large Language Models). Roughly 4 characters or 0.75 words. RateGuard tracks these to help you manage costs.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="upstream">
            <AccordionTrigger>Upstream</AccordionTrigger>
            <AccordionContent>
              The destination API that RateGuard forwards requests to (e.g., OpenAI, Anthropic, or your own backend).
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="webhook">
            <AccordionTrigger>Webhook</AccordionTrigger>
            <AccordionContent>
              A way for RateGuard to send real-time data to your application. We use webhooks to notify you of events like rate limit breaches or budget alerts.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
