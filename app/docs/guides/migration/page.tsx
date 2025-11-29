import { Metadata } from "next";
import { TrendingUp, Server, Cloud } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Migrating from AWS/Kong | RateGuard Documentation",
  description: "Guide to migrating from other API gateways.",
};

export default function MigrationPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <TrendingUp className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Migrating from AWS/Kong
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Moving to RateGuard is easier than convincing your boss to let you rewrite everything in Rust.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Why Migrate? */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Why Migrate?</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="size-5 text-primary" />
                  AWS API Gateway
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  AWS is great, but it's complex and expensive. And good luck debugging those CloudWatch logs.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-sm text-muted-foreground">
                  <li><strong>Complexity:</strong> High</li>
                  <li><strong>Cost:</strong> High</li>
                  <li><strong>LLM Support:</strong> None</li>
                </ul>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="size-5 text-primary" />
                  Kong / Tyk
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Powerful, but heavy. Managing your own gateway infrastructure is a full-time job.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-sm text-muted-foreground">
                  <li><strong>Maintenance:</strong> High</li>
                  <li><strong>Setup:</strong> Difficult</li>
                  <li><strong>LLM Support:</strong> Limited</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Migration Steps */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Migration Steps</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-2">1. Map Your Routes</h3>
              <p className="text-muted-foreground mb-4">
                RateGuard uses a simple proxy structure. You don't need to define complex routing tables.
              </p>
              <Card className="bg-muted/50">
                <CardContent className="pt-6 font-mono text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground mb-1">Old (AWS/Kong)</p>
                      <p>https://api.yourdomain.com/v1/chat</p>
                    </div>
                    <div>
                      <p className="text-primary mb-1">New (RateGuard)</p>
                      <p>https://api.rateguard.io/proxy/openai/v1/chat</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2">2. Update Client Code</h3>
              <p className="text-muted-foreground mb-4">
                Change the base URL in your client SDKs. That's usually all it takes.
              </p>
              <CodeTabs
                examples={[
                  {
                    label: "Before (Node.js)",
                    language: "javascript",
                    code: `const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});`,
                  },
                  {
                    label: "After (Node.js)",
                    language: "javascript",
                    code: `const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.rateguard.io/proxy/openai/v1',
  defaultHeaders: {
    'X-RG-Key': process.env.RATEGUARD_API_KEY
  }
});`,
                  },
                ]}
              />
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2">3. Configure Rate Limits</h3>
              <p className="text-muted-foreground mb-4">
                Recreate your rate limit rules in the RateGuard dashboard.
                We support global limits, per-user limits, and custom key limits.
              </p>
            </div>
          </div>
        </section>

        <Callout type="success" title="Need Help?">
          Migrating a large production API? Contact our support team. We can help you plan a zero-downtime migration.
        </Callout>
      </div>
    </div>
  );
}
