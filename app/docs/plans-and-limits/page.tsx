import { Metadata } from "next";
import { CreditCard, Check, X, HelpCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Supported Plans & Limits | RateGuard Documentation",
  description: "Detailed breakdown of RateGuard plans and limits.",
};

export default function PlansAndLimitsPage() {
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
              Supported Plans & Limits
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Transparent pricing for every stage of growth. No hidden fees, no surprises.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Plans Table */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Plan Overview</h2>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[200px]">Feature</TableHead>
                  <TableHead className="text-center">Free</TableHead>
                  <TableHead className="text-center">Starter</TableHead>
                  <TableHead className="text-center font-bold text-primary">Pro</TableHead>
                  <TableHead className="text-center">Business</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Monthly Cost</TableCell>
                  <TableCell className="text-center">$0</TableCell>
                  <TableCell className="text-center">$29</TableCell>
                  <TableCell className="text-center font-bold">$99</TableCell>
                  <TableCell className="text-center">$499</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Request Quota</TableCell>
                  <TableCell className="text-center">10k / mo</TableCell>
                  <TableCell className="text-center">100k / mo</TableCell>
                  <TableCell className="text-center font-bold">1M / mo</TableCell>
                  <TableCell className="text-center">10M / mo</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Token Quota (LLM)</TableCell>
                  <TableCell className="text-center">1M tokens</TableCell>
                  <TableCell className="text-center">10M tokens</TableCell>
                  <TableCell className="text-center font-bold">100M tokens</TableCell>
                  <TableCell className="text-center">1B tokens</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">API Keys</TableCell>
                  <TableCell className="text-center">3</TableCell>
                  <TableCell className="text-center">10</TableCell>
                  <TableCell className="text-center font-bold">Unlimited</TableCell>
                  <TableCell className="text-center">Unlimited</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Data Retention</TableCell>
                  <TableCell className="text-center">24 hours</TableCell>
                  <TableCell className="text-center">7 days</TableCell>
                  <TableCell className="text-center font-bold">30 days</TableCell>
                  <TableCell className="text-center">90 days</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Feature Matrix */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Feature Matrix</h2>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[250px]">Capability</TableHead>
                  <TableHead className="text-center">Free</TableHead>
                  <TableHead className="text-center">Starter</TableHead>
                  <TableHead className="text-center font-bold text-primary">Pro</TableHead>
                  <TableHead className="text-center">Business</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium flex items-center gap-2">
                    Dual Pricing Model
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="size-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Track both request counts and token usage separately.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Real-time Analytics</TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Token Analytics API</TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Webhooks</TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Custom Domains</TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">SLA Guarantee</TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><X className="size-5 text-muted-foreground mx-auto" /></TableCell>
                  <TableCell className="text-center"><Check className="size-5 text-green-500 mx-auto" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
