import { Metadata } from "next";
import { BarChart } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { CodeTabs } from "@/components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Token Analytics API | RateGuard Documentation",
  description: "Technical reference for the RateGuard Analytics API.",
};

export default function AnalyticsApiPage() {
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
              Token Analytics API
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Get your data out. Build your own dashboard. We won&apos;t judge.
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
              <p className="text-primary font-bold">https://api.rateguard.io/v1/analytics</p>
            </CardContent>
          </Card>
        </section>

        {/* Authentication */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Authentication</h2>
          <p className="text-muted-foreground">
            Authenticate using your API key as a Bearer token.
          </p>
          <CodeTabs
            examples={[
              {
                label: "Header",
                language: "bash",
                code: `Authorization: Bearer rg_live_abc123`,
              },
            ]}
          />
        </section>

        {/* Endpoints */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Endpoints</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-2 font-mono">GET /usage</h3>
              <p className="text-muted-foreground mb-4">
                Get aggregated usage data for a specific time range.
              </p>
              <div className="border rounded-lg overflow-hidden mb-4">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 font-medium">
                    <tr>
                      <th className="p-4">Query Parameter</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="p-4 font-mono">start</td>
                      <td className="p-4">string (ISO 8601)</td>
                      <td className="p-4">Start date (e.g., `2023-01-01T00:00:00Z`).</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-mono">end</td>
                      <td className="p-4">string (ISO 8601)</td>
                      <td className="p-4">End date.</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-mono">interval</td>
                      <td className="p-4">string</td>
                      <td className="p-4">Aggregation interval (`hour`, `day`, `month`).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <CodeTabs
                examples={[
                  {
                    label: "Response",
                    language: "json",
                    code: `{
  "data": [
    {
      "timestamp": "2023-01-01T00:00:00Z",
      "requests": 150,
      "tokens": 4500,
      "cost": 0.09
    },
    ...
  ]
}`,
                  },
                ]}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
