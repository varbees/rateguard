import { Metadata } from "next";
import { CreditCard } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Account & Billing FAQ | RateGuard Documentation",
  description: "Questions about billing, invoices, and plans.",
};

export default function BillingFaqPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <CreditCard className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Account & Billing FAQ
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Money matters. Here's how we handle yours.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="payment-methods">
            <AccordionTrigger>What payment methods do you accept?</AccordionTrigger>
            <AccordionContent>
              We accept all major credit cards (Visa, Mastercard, Amex) via Stripe. For Enterprise plans, we can support invoicing and wire transfers.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="cancellation">
            <AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
            <AccordionContent>
              Yes. You can cancel your subscription at any time from the dashboard. Your access will continue until the end of your current billing period.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="refunds">
            <AccordionTrigger>Do you offer refunds?</AccordionTrigger>
            <AccordionContent>
              We generally do not offer refunds for partial months. However, if you made a mistake and contacted us immediately (within 24 hours), we might be able to help.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="upgrade-downgrade">
            <AccordionTrigger>What happens if I upgrade or downgrade?</AccordionTrigger>
            <AccordionContent>
              <strong>Upgrades:</strong> Happen immediately. You'll be charged the prorated difference.
              <br />
              <strong>Downgrades:</strong> Happen at the end of your billing cycle. You'll keep your current features until then.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
