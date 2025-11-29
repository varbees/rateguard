import { Metadata } from "next";
import { BarChart, Calculator, Coins } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "LLM Token Tracking | RateGuard Documentation",
  description: "Track token usage for LLM APIs.",
};

export default function LLMTokenTrackingPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <BarChart className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              LLM Token Tracking
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Counting tokens is boring. We do it for you, so you can focus on building the next Skynet.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* How it Works */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="size-6 text-primary" />
            How it Works
          </h2>
          <p className="text-lg text-muted-foreground">
            We inspect the response body of every request to supported LLM providers.
            We extract the `usage` field (for non-streaming) or count tokens on the fly (for streaming).
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Prompt Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  The tokens you send to the model. Usually cheaper.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Completion Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  The tokens the model generates. Usually more expensive.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Cost Estimation */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="size-6 text-primary" />
            Cost Estimation
          </h2>
          <p className="text-lg text-muted-foreground">
            We maintain an up-to-date database of pricing for major models (GPT-4, Claude 3, etc.).
            We use this to estimate the dollar cost of every request.
          </p>
          
          <Callout type="default" title="Note">
            These are estimates. Your actual bill from OpenAI/Anthropic might vary slightly due to rounding or custom pricing.
          </Callout>
        </section>

        {/* Supported Models */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Supported Models</h2>
          <p className="text-muted-foreground">
            We automatically detect the model from the request body.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li><strong>OpenAI:</strong> GPT-4, GPT-3.5 Turbo, DALL-E (requests only), Whisper (requests only).</li>
            <li><strong>Anthropic:</strong> Claude 3 Opus, Sonnet, Haiku.</li>
            <li><strong>Cohere:</strong> Command R, Command R+.</li>
            <li><strong>Mistral:</strong> Mistral Large, Mistral Small.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
