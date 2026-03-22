import { Metadata } from "next";
import {
  Shield,
  Zap,
  Network,
  ArrowRight,
  Code2,
  CheckCircle2,
  Globe,
  Server,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { DOCS_PROXY_BASE_URL } from "@/lib/docs/urls";

export const metadata: Metadata = {
  title: "Proxy Path | RateGuard Documentation",
  description:
    "Learn how the proxy forwards requests for existing clients.",
};

export default function TransparentProxyPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Network className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Proxy Path
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              This is the proxy path. It is useful when you have an existing client and do not want to rewire it all at once.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* How It Works */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">How It Works</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            You point your existing client at the proxy endpoint. We route, enforce, and observe in the middle.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="size-4 text-primary" />
                  1. Ingress
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Request hits your RateGuard host. We validate the request and load your policy preset.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="size-4 text-primary" />
                  2. Policy Check
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Rate limits, quotas, and guardrails are evaluated before the request moves on.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ArrowRight className="size-4 text-primary" />
                  3. Forward
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We forward it to the upstream provider or service you already use.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Quick Start */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Code2 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Quick Start</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Change the URL, add a header, and keep moving. It is the shortest path for teams that are not ready to embed middleware yet.
          </p>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Before & After</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-red-500/5 border-red-500/20">
                <div className="flex items-center gap-2 mb-2 text-red-500 font-bold text-sm">
                  <span className="text-lg">❌</span> Direct Client
                </div>
                <code className="text-xs font-mono block break-all">
                  https://api.openai.com/v1/chat/completions
                </code>
              </div>
              <div className="p-4 border rounded-lg bg-green-500/5 border-green-500/20">
                <div className="flex items-center gap-2 mb-2 text-green-500 font-bold text-sm">
                  <span className="text-lg">✅</span> Proxy Path
                </div>
                <code className="text-xs font-mono block break-all">
                  {`${DOCS_PROXY_BASE_URL}/openai/v1/chat/completions`}
                </code>
              </div>
            </div>
          </div>

          <CodeTabs
            examples={[
              {
                label: "cURL",
                language: "bash",
                code: `curl ${DOCS_PROXY_BASE_URL}/openai/v1/chat/completions \\
  -H "Authorization: Bearer rg_live_xyz" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
              },
              {
                label: "Node.js",
                language: "javascript",
                code: `const response = await fetch('${DOCS_PROXY_BASE_URL}/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rg_live_xyz',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});`,
              },
            ]}
            defaultLanguage="curl"
          />
        </section>

        {/* Features */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">What We Support</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Streaming (SSE)</h4>
                <p className="text-sm text-muted-foreground">
                  We stream tokens and events as they happen.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Websockets</h4>
                <p className="text-sm text-muted-foreground">
                  Full duplex communication for live dashboards and operational events.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Binary Data</h4>
                <p className="text-sm text-muted-foreground">
                  Images, audio, video. We handle it all.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Custom Headers</h4>
                <p className="text-sm text-muted-foreground">
                  Pass request metadata through without losing control of the contract.
                </p>
              </div>
            </div>
          </div>
        </section>

        <Callout type="warning" title="Operational Note">
          Keep health checks pointed at your service directly. The proxy path is for application traffic, not liveness probes.
        </Callout>
      </div>
    </div>
  );
}
