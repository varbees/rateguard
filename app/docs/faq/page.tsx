import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreditCard, Shield, Zap, LifeBuoy, ArrowRight } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions - RateGuard",
  description: "Find answers to common questions about RateGuard",
};

const faqCategories = [
  {
    title: "Billing & Subscription",
    description: "Pricing, plans, invoices, and refunds.",
    href: "/docs/faq/billing",
    icon: CreditCard,
  },
  {
    title: "Product & Features",
    description: "Rate limiting, analytics, and API gateway features.",
    href: "/docs/faq/product",
    icon: Zap,
  },
  {
    title: "Security & Privacy",
    description: "Data protection, encryption, and compliance.",
    href: "/docs/faq/security",
    icon: Shield,
  },
  {
    title: "Support & Contact",
    description: "How to get help and contact our team.",
    href: "/docs/faq/support",
    icon: LifeBuoy,
  },
];

export default function FAQPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="text-center mb-16 animate-fade-in-up">
        <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Everything you need to know about RateGuard. Can&apos;t find the answer you&apos;re
          looking for?{" "}
          <Link href="/contact" className="text-primary hover:underline">
            Contact our support team.
          </Link>
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {faqCategories.map((category) => {
          const Icon = category.icon;
          return (
            <Link
              key={category.href}
              href={category.href}
              className="group block h-full"
            >
              <Card className="h-full transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:-translate-y-1">
                <CardHeader>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                  <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                    {category.title}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {category.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
