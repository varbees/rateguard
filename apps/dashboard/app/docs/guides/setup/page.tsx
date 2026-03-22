import { Metadata } from "next";
import { Settings, Shield, Zap, Server } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Callout } from "@/components/docs/Callout";
import { DOCS_PROXY_BASE_URL } from "@/lib/docs/urls";

export const metadata: Metadata = {
  title: "Setup & First Middleware | RateGuard Documentation",
  description: "Get your first middleware integration up and running.",
};

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Settings className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Setup & First Middleware
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Let&apos;s get this started without ceremony. The goal is simple: wrap your first API with RateGuard and keep moving.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        <Callout type="default" title="Choose Your Path">
          RateGuard has two supported entry points: in-process middleware in
          your app, or the proxy path through the control plane. The SDK path
          does not require a dashboard account or control-plane URL.
        </Callout>

        {/* Prerequisites */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Prerequisites</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>An upstream API key if you are using a provider proxy (e.g., OpenAI, Anthropic, or your own backend).</li>
            <li>A RateGuard account and API key only if you want proxy mode or dashboard-backed realtime events.</li>
          </ul>
        </section>

        {/* The Concept */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">The Concept</h2>
          <p className="text-lg text-muted-foreground">
            RateGuard works best as middleware. If you are using the proxy path, the request still looks familiar.
          </p>
          <Card className="bg-muted/50">
            <CardContent className="pt-6 font-mono text-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <span className="line-through">https://api.openai.com/v1/chat/completions</span>
              </div>
              <div className="flex items-center gap-2 text-primary font-bold">
                <span>{`${DOCS_PROXY_BASE_URL}/openai/v1/chat/completions`}</span>
              </div>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            Prefer the middleware path? Use the SDK quickstart and keep the proxy route as the fallback.
          </p>
        </section>

        {/* Step-by-Step */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Step-by-Step</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Shield className="size-5 text-primary" />
                1. Authenticate with RateGuard
              </h3>
              <p className="text-muted-foreground mb-4">
                Only the proxy path uses the `X-RG-Key` header. If you are using the Python or Node SDK directly, you do not need it.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Server className="size-5 text-primary" />
                2. Authenticate with Upstream
              </h3>
              <p className="text-muted-foreground mb-4">
                We forward your `Authorization` header to the upstream provider. So, include your OpenAI/Anthropic key just like you normally would.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Zap className="size-5 text-primary" />
                3. Fire Away
              </h3>
              <CodeTabs
                examples={[
                  {
                    label: "cURL",
                    language: "bash",
                    code: `curl -X POST "${DOCS_PROXY_BASE_URL}/openai/v1/chat/completions" \\
  -H "Authorization: Bearer sk-..." \\
  -H "X-RG-Key: rg_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Tell me a joke."}]
  }'`,
                  },
                  {
                    label: "Python",
                    language: "python",
                    code: `import requests

url = "${DOCS_PROXY_BASE_URL}/openai/v1/chat/completions"
headers = {
    "Authorization": "Bearer sk-...",
    "X-RG-Key": "rg_live_...",
    "Content-Type": "application/json"
}
data = {
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Tell me a joke."}]
}

response = requests.post(url, headers=headers, json=data)
print(response.json())`,
                  },
                ]}
              />
            </div>
          </div>
        </section>

        <Callout type="warning" title="Important">
          Do not expose your RateGuard API key in client-side code (browsers, mobile apps). Always proxy requests through your own backend server.
        </Callout>
      </div>
    </div>
  );
}
