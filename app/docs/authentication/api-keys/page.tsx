import * as React from "react";
import { Metadata } from "next";
import {
  Shield,
  Key,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Code2,
  RefreshCw,
  Zap,
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
import { ApiKeyDemo } from "@/components/docs/ApiKeyDemo";
import {
  authenticationExamples,
  rateLimitingExamples,
  errorHandlingExamples,
  keyRotationExamples,
  responseExamples,
} from "@/lib/docs/code-examples";

export const metadata: Metadata = {
  title: "API Keys & Authentication | RateGuard Documentation",
  description:
    "Learn how to authenticate with RateGuard API using API keys and implement secure authentication in your applications.",
};

export default function ApiKeysAuthenticationPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-linear-to-b from-muted/50 to-background">
        <div className="container max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                API Keys & Authentication
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Secure your RateGuard API requests with API key authentication.
                Generate, manage, and rotate keys safely for production
                workloads.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-primary" />
                  <CardTitle className="text-sm">AES-256-GCM</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Military-grade encryption for all API communications
                </p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  <CardTitle className="text-sm">Multi-Tier Limiting</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Sophisticated rate limiting with 20 worker goroutines
                </p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-primary" />
                  <CardTitle className="text-sm">CORS Whitelisting</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Per-API CORS configuration for enhanced security
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-5xl mx-auto px-6 py-12">
        {/* Quick Start */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Code2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Quick Start</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            RateGuard uses API key authentication for all requests. Include your
            API key in the{" "}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">
              X-API-Key
            </code>{" "}
            header to authenticate your requests.
          </p>

          <CodeTabs
            examples={authenticationExamples.examples}
            defaultLanguage="curl"
          />

          <Callout type="default" title="API Base URL">
            All API requests should be made to:{" "}
            <code className="font-mono text-sm">
              https://api.rateguard.io/v1
            </code>
          </Callout>
        </section>

        {/* Authentication Methods */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Key className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Authentication Methods</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="size-5" />
                  API Key Authentication
                </CardTitle>
                <CardDescription>
                  For server-to-server communication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Use API keys for production applications and backend
                    services.
                  </p>
                  <div className="p-3 rounded-lg bg-muted/30 dark:bg-muted/10 border">
                    <code className="text-xs font-mono break-all">
                      X-API-Key: rg_live_abc123xyz789...
                    </code>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-500" />
                  <span className="text-sm">Recommended for production</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-500" />
                  <span className="text-sm">
                    No expiration (manual rotation)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="size-5" />
                  Bearer Token (Development)
                </CardTitle>
                <CardDescription>For testing and development</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Use bearer tokens for local development and testing.
                  </p>
                  <div className="p-3 rounded-lg bg-muted/30 dark:bg-muted/10 border">
                    <code className="text-xs font-mono break-all">
                      Authorization: Bearer &lt;token&gt;
                    </code>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-yellow-500" />
                  <span className="text-sm">Development only</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-yellow-500" />
                  <span className="text-sm">Short-lived tokens (24h)</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Callout type="warning" title="Production Security">
            Always use API key authentication (
            <code className="font-mono text-xs">X-API-Key</code>) for production
            environments. Never commit API keys to version control or expose
            them in client-side code.
          </Callout>
        </section>

        {/* API Key Management */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <RefreshCw className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Managing API Keys</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Generate and manage your API keys through the RateGuard dashboard or
            API. Each key is scoped to a specific environment and can have
            granular permissions.
          </p>

          <ApiKeyDemo />

          <div className="mt-8 space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-3">
                Generating API Keys
              </h3>
              <p className="text-muted-foreground mb-4">
                Create new API keys programmatically using the API:
              </p>
              <CodeTabs
                examples={keyRotationExamples.examples.slice(0, 3)}
                defaultLanguage="curl"
              />
            </div>

            <Callout type="success" title="Best Practice">
              Use separate API keys for different environments (development,
              staging, production) and different services. This makes key
              rotation easier and limits the blast radius if a key is
              compromised.
            </Callout>
          </div>
        </section>

        {/* Rate Limiting */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Rate Limiting</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            RateGuard implements multi-tier rate limiting with Redis caching and
            a 20-goroutine worker pool for optimal performance. Monitor your
            rate limit status programmatically.
          </p>

          <CodeTabs
            examples={rateLimitingExamples.examples}
            defaultLanguage="javascript"
          />

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Rate Limit Headers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs font-mono">
                  <div className="text-muted-foreground">X-RateLimit-Limit</div>
                  <div className="text-muted-foreground">
                    X-RateLimit-Remaining
                  </div>
                  <div className="text-muted-foreground">X-RateLimit-Reset</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Default Limits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Free Tier:</span>
                    <Badge variant="secondary">1,000/hour</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pro Tier:</span>
                    <Badge variant="secondary">10,000/hour</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Enterprise:</span>
                    <Badge variant="secondary">Custom</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Worker Pool</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="text-muted-foreground">
                    20 concurrent goroutines
                  </div>
                  <div className="text-muted-foreground">
                    Redis-backed caching
                  </div>
                  <div className="text-muted-foreground">
                    PostgreSQL persistence
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Error Handling */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Error Handling</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Handle authentication errors gracefully in your application. The API
            returns standard HTTP status codes with detailed error messages.
          </p>

          <div className="space-y-6 mb-8">
            <Card className="border-l-4 border-l-red-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">401 Unauthorized</CardTitle>
                  <Badge variant="destructive">Error</Badge>
                </div>
                <CardDescription>Missing or invalid API key</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted/30 dark:bg-muted/10 p-3 rounded-lg overflow-x-auto border">
                  <code>
                    {JSON.stringify(
                      responseExamples.unauthorized.body,
                      null,
                      2
                    )}
                  </code>
                </pre>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-orange-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">403 Forbidden</CardTitle>
                  <Badge variant="destructive">Error</Badge>
                </div>
                <CardDescription>
                  API key lacks required permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted/30 dark:bg-muted/10 p-3 rounded-lg overflow-x-auto border">
                  <code>
                    {JSON.stringify(responseExamples.forbidden.body, null, 2)}
                  </code>
                </pre>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    429 Too Many Requests
                  </CardTitle>
                  <Badge variant="secondary">Rate Limit</Badge>
                </div>
                <CardDescription>Rate limit exceeded</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted/30 dark:bg-muted/10 p-3 rounded-lg overflow-x-auto border">
                  <code>
                    {JSON.stringify(
                      responseExamples.rateLimitExceeded.body,
                      null,
                      2
                    )}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <CodeTabs
            examples={errorHandlingExamples.examples}
            defaultLanguage="typescript"
          />
        </section>

        {/* Key Rotation */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <RefreshCw className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Rotating API Keys</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Regular key rotation is a security best practice. Follow this
            workflow to rotate keys without downtime:
          </p>

          <div className="space-y-4 mb-8">
            <div className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                1
              </div>
              <div>
                <h4 className="font-semibold mb-1">Generate New Key</h4>
                <p className="text-sm text-muted-foreground">
                  Create a new API key while keeping the old one active
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                2
              </div>
              <div>
                <h4 className="font-semibold mb-1">Update Application</h4>
                <p className="text-sm text-muted-foreground">
                  Deploy your application with the new API key
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                3
              </div>
              <div>
                <h4 className="font-semibold mb-1">Monitor Traffic</h4>
                <p className="text-sm text-muted-foreground">
                  Verify all traffic is using the new key
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                4
              </div>
              <div>
                <h4 className="font-semibold mb-1">Revoke Old Key</h4>
                <p className="text-sm text-muted-foreground">
                  Safely delete the old key once migration is complete
                </p>
              </div>
            </div>
          </div>

          <CodeTabs
            examples={keyRotationExamples.examples}
            defaultLanguage="typescript"
          />

          <Callout type="warning" title="Zero-Downtime Rotation">
            Never revoke your old key before deploying the new one. Always
            maintain at least one active key during the rotation process to
            avoid service interruptions.
          </Callout>
        </section>

        {/* Security Best Practices */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Security Best Practices</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-green-500" />
                  Do
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    Store API keys in environment variables
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    Use different keys for each environment
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    Rotate keys regularly (every 90 days)
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    Monitor API key usage for anomalies
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    Use HTTPS for all API requests
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-500">•</span>
                    Implement request signing for sensitive operations
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="size-5 text-red-500" />
                  Don&apos;t
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-red-500">•</span>
                    Commit API keys to version control
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500">•</span>
                    Expose keys in client-side code
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500">•</span>
                    Share keys across multiple services
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500">•</span>
                    Use production keys in development
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500">•</span>
                    Log full API keys in application logs
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-500">•</span>
                    Hardcode keys in your application
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Callout
            type="danger"
            title="Security Incident Response"
            className="mt-6"
          >
            If an API key is compromised, immediately revoke it through the
            dashboard or API. Generate a new key and update your application.
            Contact support at{" "}
            <a
              href="mailto:security@rateguard.io"
              className="underline font-medium"
            >
              security@rateguard.io
            </a>{" "}
            if you suspect unauthorized access.
          </Callout>
        </section>

        {/* Next Steps */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Code2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Next Steps</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
              <CardHeader>
                <CardTitle className="text-base">API Reference</CardTitle>
                <CardDescription>
                  Explore all available endpoints and parameters
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
              <CardHeader>
                <CardTitle className="text-base">Rate Limiting Guide</CardTitle>
                <CardDescription>
                  Deep dive into rate limiting strategies
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50">
              <CardHeader>
                <CardTitle className="text-base">SDKs & Libraries</CardTitle>
                <CardDescription>
                  Official client libraries for popular languages
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
