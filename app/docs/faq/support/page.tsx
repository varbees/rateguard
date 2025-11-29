import { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Support FAQ | RateGuard Documentation",
  description: "How to get help when things go wrong.",
};

export default function SupportFaqPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <LifeBuoy className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Support FAQ
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We're here to help. Unless it's 3 AM on a Sunday. Then we're sleeping.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="contact">
            <AccordionTrigger>How do I contact support?</AccordionTrigger>
            <AccordionContent>
              You can email us at <a href="mailto:support@rateguard.io" className="text-primary hover:underline">support@rateguard.io</a>. If you're on a Pro or Enterprise plan, you can also use the live chat in the dashboard.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="response-time">
            <AccordionTrigger>What is your response time?</AccordionTrigger>
            <AccordionContent>
              <strong>Free/Starter:</strong> Best effort (usually 24-48 hours).
              <br />
              <strong>Pro:</strong> Priority support (usually within 4 hours during business hours).
              <br />
              <strong>Enterprise:</strong> Dedicated support with SLA guarantees.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="feature-request">
            <AccordionTrigger>Can I request a feature?</AccordionTrigger>
            <AccordionContent>
              Absolutely! We love feedback. Drop us an email or tweet at us. If it's a good idea, we'll build it. If it's a bad idea, we'll politely nod.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
