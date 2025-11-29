import { Metadata } from "next";
import Link from "next/link";
import { Zap, CreditCard, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Welcome | RateGuard Documentation",
  description: "Get started with RateGuard in under 2 minutes.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome to RateGuard
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-3xl">
            RateGuard is the all-in-one API gateway for AI developers. We help you proxy requests, count LLM tokens, and protect your APIs from abuse.
            <br />
            <span className="font-semibold text-foreground">Get started in under 2 minutes.</span>
          </p>
          
          <div className="flex items-center gap-4">
            <Button asChild size="lg" className="gap-2">
              <Link href="/docs/quickstart">
                <Zap className="size-4" />
                Quickstart
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/docs/plans-and-limits">
                <CreditCard className="size-4" />
                View Plans
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-8">
        <div className="p-6 bg-primary/5 border border-primary/10 rounded-lg">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <span className="text-primary">TL;DR</span>
          </h2>
          <p className="text-lg font-medium text-foreground/90">
            Proxy your requests, count LLM tokens, protect your APIs.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Link href="/docs/quickstart" className="group">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md">
              <CardContent className="p-6 space-y-4">
                <div className="p-3 w-fit rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Zap className="size-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                    Quickstart
                    <ArrowRight className="size-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="text-muted-foreground">
                    Copy-paste a curl command and proxy your first request in less than a minute.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/docs/plans-and-limits" className="group">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md">
              <CardContent className="p-6 space-y-4">
                <div className="p-3 w-fit rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <CreditCard className="size-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                    Plans & Limits
                    <ArrowRight className="size-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="text-muted-foreground">
                    Understand our Free, Starter, Pro, and Business tiers and what you get with each.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
