import { Metadata } from "next";
import { Bug, Search, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Debugging API Calls | RateGuard Documentation",
  description: "Troubleshoot and debug your API calls.",
};

export default function DebuggingPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Bug className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Debugging API Calls
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Something went wrong. Don't panic. We have logs.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Common Issues */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Common Issues</h2>
          
          <div className="space-y-4">
            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2 flex items-center gap-2 text-red-500">
                <AlertTriangle className="size-4" />
                401 Unauthorized
              </h3>
              <p className="text-muted-foreground mb-2">
                <strong>Cause:</strong> You forgot the `X-RG-Key` header, or your key is invalid.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Fix:</strong> Check your headers. Make sure you're using a valid API key from the dashboard.
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2 flex items-center gap-2 text-yellow-500">
                <AlertTriangle className="size-4" />
                429 Too Many Requests
              </h3>
              <p className="text-muted-foreground mb-2">
                <strong>Cause:</strong> You hit a rate limit. Congratulations, you're popular!
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Fix:</strong> Increase your limit in the dashboard, or implement exponential backoff in your client.
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold mb-2 flex items-center gap-2 text-orange-500">
                <AlertTriangle className="size-4" />
                502 Bad Gateway
              </h3>
              <p className="text-muted-foreground mb-2">
                <strong>Cause:</strong> The upstream provider (e.g., OpenAI) is down or returning invalid responses.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Fix:</strong> Check the status page of the upstream provider. It's probably not us.
              </p>
            </div>
          </div>
        </section>

        {/* Using the Request Log */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Search className="size-6 text-primary" />
            Using the Request Log
          </h2>
          <p className="text-lg text-muted-foreground">
            The Request Log is your best friend. It shows every request that passed through RateGuard.
          </p>
          
          <Card>
            <CardHeader>
              <CardTitle>What you can see</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-4 space-y-2 text-muted-foreground">
                <li><strong>Request Headers:</strong> Did you send the right Content-Type?</li>
                <li><strong>Response Status:</strong> What did the upstream say?</li>
                <li><strong>Latency:</strong> How long did it take?</li>
                <li><strong>Request ID:</strong> A unique ID for tracing.</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <Callout type="default" title="Tracing">
          Every request gets a unique `X-RG-Request-ID` header. If you need to contact support, include this ID so we can find your request instantly.
        </Callout>
      </div>
    </div>
  );
}
