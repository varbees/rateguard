import { Metadata } from "next";
import { Server } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { CodeTabs } from "@/components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Proxy API Reference | RateGuard Documentation",
  description: "Technical reference for the RateGuard Proxy API.",
};

export default function ProxyApiPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Server className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Proxy API Reference
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              The nuts and bolts of how to talk to us.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Base URL */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Base URL</h2>
          <Card className="bg-muted/50">
            <CardContent className="pt-6 font-mono text-sm">
              <p className="text-primary font-bold">https://api.rateguard.io/proxy</p>
            </CardContent>
          </Card>
        </section>

        {/* Authentication */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Authentication</h2>
          <p className="text-muted-foreground">
            Authenticate using the `X-RG-Key` header.
          </p>
          <CodeTabs
            examples={[
              {
                label: "Header",
                language: "bash",
                code: `X-RG-Key: rg_live_abc123`,
              },
            ]}
          />
        </section>

        {/* Endpoints */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Endpoints</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-2 font-mono">ANY /proxy/{"{provider}"}{"/*"}</h3>
              <p className="text-muted-foreground mb-4">
                Proxies requests to the specified provider.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 font-medium">
                    <tr>
                      <th className="p-4">Parameter</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="p-4 font-mono">provider</td>
                      <td className="p-4">string</td>
                      <td className="p-4">The upstream provider (e.g., `openai`, `anthropic`).</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-mono">*</td>
                      <td className="p-4">path</td>
                      <td className="p-4">The rest of the upstream path (e.g., `/v1/chat/completions`).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Headers */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Response Headers</h2>
          <p className="text-muted-foreground">
            We add the following headers to every response:
          </p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 font-medium">
                <tr>
                  <th className="p-4">Header</th>
                  <th className="p-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-4 font-mono">X-RG-Request-ID</td>
                  <td className="p-4">Unique ID for the request.</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono">X-RG-Limit-Remaining</td>
                  <td className="p-4">Number of requests remaining in the current window.</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono">X-RG-Limit-Reset</td>
                  <td className="p-4">Time (in seconds) until the limit resets.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
