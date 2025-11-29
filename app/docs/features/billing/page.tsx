import { Metadata } from "next";
import { CreditCard, DollarSign, PieChart } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Billing & Usage | RateGuard Documentation",
  description: "Manage billing and monitor usage.",
};

export default function BillingPage() {
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
              Billing & Usage
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We like getting paid. You like knowing what you're paying for. It's a win-win.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Usage Monitoring */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <PieChart className="size-6 text-primary" />
            Usage Monitoring
          </h2>
          <p className="text-lg text-muted-foreground">
            We track every request and every token. You can see your usage in real-time on the dashboard.
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Request Quota</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  The total number of API calls you've made this billing cycle.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Token Quota</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  The total number of LLM tokens (prompt + completion) you've processed.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Billing Cycle */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="size-6 text-primary" />
            Billing Cycle
          </h2>
          <p className="text-muted-foreground">
            We bill monthly. Your cycle starts on the day you upgrade to a paid plan.
            If you upgrade on January 15th, your next bill will be on February 15th.
          </p>
        </section>

        {/* Overage */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Overage</h2>
          <p className="text-muted-foreground">
            What happens if you go over your limit?
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li><strong>Free Plan:</strong> We stop processing requests. You'll get a 429 error.</li>
            <li><strong>Paid Plans:</strong> We'll keep processing requests, but we'll charge you a small overage fee per request/token. Or we might just ask you nicely to upgrade.</li>
          </ul>
        </section>

        <Callout type="warning" title="Downgrading">
          If you downgrade your plan, you'll lose access to Pro features immediately. We don't pro-rate refunds for partial months (unless you ask really nicely).
        </Callout>
      </div>
    </div>
  );
}
