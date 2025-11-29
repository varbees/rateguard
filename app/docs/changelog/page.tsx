import { Metadata } from "next";
import { Sparkles, GitCommit } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Release Notes | RateGuard Documentation",
  description: "What's new in RateGuard.",
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Sparkles className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Release Notes
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We're constantly improving. Here's proof.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* v1.0.0 */}
        <section className="space-y-6 relative border-l-2 border-muted pl-8 pb-8">
          <div className="absolute -left-[9px] top-0 size-4 rounded-full bg-primary" />
          
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-2xl font-bold">v1.0.0 - The Beginning</h2>
            <Badge variant="secondary">November 2025</Badge>
          </div>
          
          <div className="prose dark:prose-invert max-w-none">
            <p className="text-lg text-muted-foreground mb-4">
              We are live! RateGuard is officially out of beta and ready for production.
            </p>
            
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <GitCommit className="size-4 text-primary" />
              New Features
            </h3>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              <li><strong>LLM Token Tracking:</strong> Support for OpenAI, Anthropic, and Cohere.</li>
              <li><strong>Global Rate Limiting:</strong> Distributed rate limiting with Redis.</li>
              <li><strong>Real-time Analytics:</strong> Live dashboard updates.</li>
              <li><strong>Dual Pricing:</strong> Track request counts and token usage separately.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
