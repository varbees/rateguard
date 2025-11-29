import { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Security FAQ | RateGuard Documentation",
  description: "How we keep your data safe.",
};

export default function SecurityFaqPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <ShieldCheck className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Security FAQ
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Security is job zero. (That sounds cooler than job one).
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="encryption">
            <AccordionTrigger>Is my data encrypted?</AccordionTrigger>
            <AccordionContent>
              Yes. All data is encrypted in transit (TLS 1.2+) and at rest (AES-256). We use industry-standard encryption protocols.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="compliance">
            <AccordionTrigger>Are you SOC2 / HIPAA compliant?</AccordionTrigger>
            <AccordionContent>
              Not yet. We are working on SOC2 Type 1 compliance. If you need HIPAA compliance, please contact our sales team for an Enterprise agreement.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="api-keys">
            <AccordionTrigger>How are API keys stored?</AccordionTrigger>
            <AccordionContent>
              We hash all API keys before storing them in our database. We cannot see your API keys, and neither can anyone else. If you lose a key, you must generate a new one.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pentesting">
            <AccordionTrigger>Do you perform penetration testing?</AccordionTrigger>
            <AccordionContent>
              Yes, we perform regular internal security audits and third-party penetration tests.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
