import { Metadata } from "next";
import {
  HeartPulse,
  Activity,
  Stethoscope,
  CheckCircle2,
  XCircle,
  Server,
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
  title: "Health Checks | RateGuard Documentation",
  description:
    "Monitor the health of your RateGuard instance with built-in health check endpoints.",
};

export default function HealthChecksPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <HeartPulse className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Health Checks
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We check our own pulse more often than a hypochondriac. Or Dwight
              testing his own blood pressure.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* Endpoints */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">The Endpoints</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We expose standard endpoints for Kubernetes liveness and readiness
            probes.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 text-green-500" />
                  /health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>Liveness Probe:</strong> Are we alive? Or did we pass out
                  during the CPR training?
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">GET</Badge>
                  <code className="text-xs">http://localhost:8080/health</code>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="size-4 text-blue-500" />
                  /ready
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>Readiness Probe:</strong> Are we ready to take traffic? Or
                  are we still putting on our makeup?
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">GET</Badge>
                  <code className="text-xs">http://localhost:8080/ready</code>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Responses */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Responses</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Simple JSON responses. No drama.
          </p>

          <CodeTabs
            examples={[
              {
                label: "Healthy Response",
                language: "json",
                code: `{
  "status": "ok",
  "version": "2.1.0-optimized",
  "uptime": "24h 12m 30s",
  "components": {
    "redis": "connected",
    "database": "connected"
  }
}`,
              },
              {
                label: "Unhealthy Response",
                language: "json",
                code: `{
  "status": "error",
  "error": "redis_connection_failed",
  "components": {
    "redis": "disconnected",
    "database": "connected"
  }
}`,
              },
            ]}
          />
        </section>

        <Callout type="success" title="Kubernetes Friendly">
          These endpoints are designed to work perfectly with Kubernetes
          <code>livenessProbe</code> and <code>readinessProbe</code> configurations.
          Just plug and play.
        </Callout>

        {/* Integration */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Kubernetes Config</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Copy-paste this into your deployment YAML. We won't tell anyone you
            didn't write it yourself.
          </p>

          <CodeTabs
            examples={[
              {
                label: "deployment.yaml",
                language: "yaml",
                code: `livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 3
  periodSeconds: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5`,
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
