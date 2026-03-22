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
import { DOCS_PROXY_BASE_URL } from "@/lib/docs/urls";

export const metadata: Metadata = {
  title: "Migrating Existing APIs | RateGuard Documentation",
  description:
    "Move existing traffic to RateGuard through the proxy path or middleware, one route at a time.",
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
              Migrating Existing APIs
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              You do not need a grand rewrite. Move one route, validate the policy preset, and let the rest follow when it is ready.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Why Migrate? */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Why Teams Migrate</h2>
          <p className="text-muted-foreground text-lg max-w-3xl">
            RateGuard is useful when you already have traffic in motion and want guardrails, observability, and policy control without replacing every client on day one.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="size-5 text-primary" />
                  Existing cloud gateways
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Good enough to start, expensive to keep tuning, and never quite transparent enough when you need to explain what happened.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-sm text-muted-foreground">
                  <li><strong>Complexity:</strong> Usually spread across several consoles</li>
                  <li><strong>Cost:</strong> Easy to underestimate early</li>
                  <li><strong>LLM Support:</strong> Added later, often awkwardly</li>
                </ul>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="size-5 text-primary" />
                  Self-hosted gateways
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Powerful, but they ask for careful maintenance. That is fine if you want it, less fine if you only wanted guardrails and visibility.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-sm text-muted-foreground">
                  <li><strong>Maintenance:</strong> Ongoing and real</li>
                  <li><strong>Setup:</strong> More moving parts than most teams want</li>
                  <li><strong>LLM Support:</strong> Usually requires custom wiring</li>
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
              <h3 className="text-xl font-semibold mb-2">1. Pick One Route</h3>
              <p className="text-muted-foreground mb-4">
                Start with one production route or one internal service. Keep the blast radius small and the feedback loop short.
              </p>
              <Card className="bg-muted/50">
                <CardContent className="pt-6 font-mono text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground mb-1">Before</p>
                      <p>https://api.yourdomain.com/v1/chat</p>
                    </div>
                    <div>
                      <p className="text-primary mb-1">Through RateGuard</p>
                      <p>{`${DOCS_PROXY_BASE_URL}/openai/v1/chat`}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2">2. Update the Client or Middleware</h3>
              <p className="text-muted-foreground mb-4">
                If your application already owns the request path, install middleware. If not, point the client at the proxy endpoint first and move toward middleware later.
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
  baseURL: '${DOCS_PROXY_BASE_URL}/openai/v1',
  defaultHeaders: {
    'X-RG-Key': process.env.RATEGUARD_API_KEY
  }
});`,
                  },
                ]}
              />
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2">3. Configure Policy Presets</h3>
              <p className="text-muted-foreground mb-4">
                Recreate your request limits, queue behavior, and token guardrails in the RateGuard dashboard.
                The dashboard speaks in policy presets so operators can reason about what actually changes.
              </p>
            </div>
          </div>
        </section>

        <Callout type="success" title="Need Help?">
          Migrating a large production API? Contact our support team. We can help you stage the rollout so the proxy path and middleware path line up cleanly.
        </Callout>
      </div>
    </div>
  );
}
