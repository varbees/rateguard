import { Metadata } from "next";
import { Bot, Cpu, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "LLM Providers | RateGuard Documentation",
  description: "Connect to OpenAI, Anthropic, Cohere, and more.",
};

export default function LLMProvidersPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Bot className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              LLM Providers
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We support the big players. And the medium players. And probably the small players soon.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* OpenAI */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="size-6 text-primary" />
            OpenAI
          </h2>
          <p className="text-muted-foreground">
            Full support for Chat Completions, Embeddings, and Image Generation.
          </p>
          <Card className="bg-muted/50">
            <CardContent className="pt-6 font-mono text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Base URL:</span>
                <span className="text-primary font-bold">https://api.rateguard.io/proxy/openai/v1</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Anthropic */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="size-6 text-primary" />
            Anthropic
          </h2>
          <p className="text-muted-foreground">
            Support for Claude 3 (Opus, Sonnet, Haiku).
          </p>
          <Card className="bg-muted/50">
            <CardContent className="pt-6 font-mono text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Base URL:</span>
                <span className="text-primary font-bold">https://api.rateguard.io/proxy/anthropic</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Cohere */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="size-6 text-primary" />
            Cohere
          </h2>
          <p className="text-muted-foreground">
            Support for Command R and R+.
          </p>
          <Card className="bg-muted/50">
            <CardContent className="pt-6 font-mono text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Base URL:</span>
                <span className="text-primary font-bold">https://api.rateguard.io/proxy/cohere/v1</span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
