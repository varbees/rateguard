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

export const metadata: Metadata = {
  title: "Transparent Proxy | RateGuard Documentation",
  description:
    "Learn how RateGuard's transparent proxy seamlessly forwards requests. It's like we're not even here.",
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
              Transparent Proxy
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              It's the "Jim Halpert looking at the camera" of proxies. It sees
              everything, says nothing (unless you ask), and just works.
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
            You point your API client at us. We point at your upstream API. Magic
            happens in the middle (rate limiting, analytics, existential dread).
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
                Request hits <code>api.rateguard.io</code>. We check your ID at
                the door.
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
                Rate limits, quotas, and "is this person allowed here?" checks.
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
                We send it to Stripe/OpenAI/Your Mom's Server.
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
            Change the URL. Add a header. Done. It's easier than explaining to
            Michael why he can't say "that's what she said" in a deposition.
          </p>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Before & After</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-red-500/5 border-red-500/20">
                <div className="flex items-center gap-2 mb-2 text-red-500 font-bold text-sm">
                  <span className="text-lg">❌</span> Boring Old Way
                </div>
                <code className="text-xs font-mono block break-all">
                  https://api.openai.com/v1/chat/completions
                </code>
              </div>
              <div className="p-4 border rounded-lg bg-green-500/5 border-green-500/20">
                <div className="flex items-center gap-2 mb-2 text-green-500 font-bold text-sm">
                  <span className="text-lg">✅</span> RateGuard Way
                </div>
                <code className="text-xs font-mono block break-all">
                  https://rateguard.io/p/PROJECT_ID/openai/v1/chat/completions
                </code>
              </div>
            </div>
          </div>

          <CodeTabs
            examples={[
              {
                label: "cURL",
                language: "bash",
                code: `curl https://rateguard.io/p/proj_123/openai/v1/chat/completions \\
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
                code: `const response = await fetch('https://rateguard.io/p/proj_123/openai/v1/chat/completions', {
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
                  We stream tokens faster than Stanley runs to his car at 5 PM.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="size-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Websockets</h4>
                <p className="text-sm text-muted-foreground">
                  Full duplex communication. Like Kelly and Ryan, but stable.
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
                  Pass whatever you want. We don't judge.
                </p>
              </div>
            </div>
          </div>
        </section>

        <Callout type="warning" title="Pro Tip">
          Don't proxy your health checks through us. That's like calling your own
          phone to see if it's ringing. Just hit your service directly for that.
        </Callout>
      </div>
    </div>
  );
}
