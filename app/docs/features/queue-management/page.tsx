import { Metadata } from "next";
import {
  Layers,
  ArrowUp,
  Clock,
  Play,
  Pause,
  FastForward,
  ListOrdered,
} from "lucide-react";
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
  title: "Queue Management | RateGuard Documentation",
  description:
    "Learn how RateGuard manages request queues to prevent overload and ensure fair usage.",
};

export default function QueueManagementPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Layers className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Queue Management
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We organize your requests like Stanley organizes his crossword
              puzzles. Efficiently, quietly, and with zero tolerance for nonsense.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Priority Queues */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Priority Queues</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Not all requests are created equal. Some are VIPs (Enterprise users),
            and some are... well, Toby.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border-t-4 border-t-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FastForward className="size-4 text-green-500" />
                  High Priority
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Enterprise plans. Critical webhooks. These skip the line.
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-blue-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Play className="size-4 text-blue-500" />
                  Normal Priority
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Standard traffic. First in, first out. Fair and square.
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-gray-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Pause className="size-4 text-gray-500" />
                  Low Priority
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Background jobs. Analytics. Free tier users (sorry).
              </CardContent>
            </Card>
          </div>
        </section>

        {/* How It Works */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">The Waiting Room</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            When the upstream API is busy, we don't just drop requests. We put
            them in a waiting room. It has nice music (metaphorically).
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold">Max Queue Size</h4>
                <p className="text-sm text-muted-foreground">
                  Limit how many requests can wait. Prevents memory leaks.
                </p>
              </div>
              <Badge variant="outline">Configurable</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold">TTL (Time To Live)</h4>
                <p className="text-sm text-muted-foreground">
                  How long a request waits before giving up.
                </p>
              </div>
              <Badge variant="outline">Default: 30s</Badge>
            </div>
          </div>
        </section>

        {/* Configuration */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <ArrowUp className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Configuration</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Set up your queues. Be the traffic controller you always wanted to be.
          </p>

          <CodeTabs
            examples={[
              {
                label: "config.yaml",
                language: "yaml",
                code: `queues:
  high:
    max_size: 1000
    workers: 10
  normal:
    max_size: 5000
    workers: 5
  low:
    max_size: 10000
    workers: 2`,
              },
            ]}
          />
        </section>

        <Callout type="warning" title="Queue Full?">
          If the queue fills up, we return a <code>429 Too Many Requests</code>.
          It's better than crashing the server.
        </Callout>
      </div>
    </div>
  );
}
