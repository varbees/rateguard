import { Metadata } from "next";
import { Zap, Key, Activity } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Quickstart | RateGuard Documentation",
  description: "Get up and running with RateGuard in less than 5 minutes. Or 2 minutes if you&apos;re fast.",
};

export default function QuickstartPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Zap className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Quickstart
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Proxy any REST or LLM API in less than 1 minute.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Step 1: Get API Key */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Badge className="h-6 w-6 rounded-full flex items-center justify-center p-0 text-sm">1</Badge>
            <h2 className="text-2xl font-bold">Get Your API Key</h2>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="size-4 text-primary" />
                Generate Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                You&apos;ll need a RateGuard account. If you don&apos;t have one, <a href="/signup" className="text-primary hover:underline">sign up here</a>. It&apos;s free.
                Go to <strong>Dashboard &gt; API Keys</strong> and create a new key.
                We&apos;ll create a new API key for you. Copy it and keep it safe. You won&apos;t see it again.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Step 2: Make a Request */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Badge className="h-6 w-6 rounded-full flex items-center justify-center p-0 text-sm">2</Badge>
            <h2 className="text-2xl font-bold">Make Your First Request</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Replace the base URL with RateGuard&apos;s proxy URL. That&apos;s it.
          </p>

          <CodeTabs
            examples={[
              {
                label: "cURL",
                language: "bash",
                code: `curl -X POST "https://api.rateguard.io/proxy/openai/v1/chat/completions" \\
  -H "Authorization: Bearer YOUR_OPENAI_KEY" \\
  -H "X-RG-Key: rg_live_abc123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
              },
              {
                label: "Node.js",
                language: "javascript",
                code: `import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'YOUR_OPENAI_KEY',
  baseURL: 'https://api.rateguard.io/proxy/openai/v1',
  defaultHeaders: {
    'X-RG-Key': 'rg_live_abc123'
  }
});

const completion = await openai.chat.completions.create({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'gpt-4',
});`,
              },
              {
                label: "Python",
                language: "python",
                code: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_OPENAI_KEY",
    base_url="https://api.rateguard.io/proxy/openai/v1",
    default_headers={"X-RG-Key": "rg_live_abc123"}
)

completion = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(completion.choices[0].message)`,
              },
            ]}
          />
        </section>

        {/* Step 3: See Dashboard */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Badge className="h-6 w-6 rounded-full flex items-center justify-center p-0 text-sm">3</Badge>
            <h2 className="text-2xl font-bold">Check the Dashboard</h2>
          </div>
          
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-12">
              <Activity className="size-12 text-primary mb-4 animate-pulse" />
              <h3 className="text-xl font-semibold mb-2">Live Updates</h3>
              <p className="text-muted-foreground max-w-md">
                Go to your dashboard now. You&apos;ll see the request you just made appear instantly in the real-time analytics view.
              </p>
            </CardContent>
          </Card>
          
          <Callout type="default" title="You're Live!">
            Your API is now protected by RateGuard. You can configure rate limits, view token usage, and set up alerts from the dashboard.
          </Callout>
        </section>
      </div>
    </div>
  );
}
