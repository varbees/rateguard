import { Metadata } from "next";
import Link from "next/link";
import { Shield, Key, Lock, ArrowRight, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Authentication | RateGuard Documentation",
  description: "Secure your API requests with RateGuard authentication methods.",
};

export default function AuthenticationPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Shield className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Authentication
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              RateGuard uses Bearer tokens. It's like a secret handshake, but
              for computers. And significantly more secure than whatever password
              you're using for your email.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* API Keys Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Key className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">API Keys</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Include your API key in the <code>Authorization</code> header of every
            request. If you forget it, we'll pretend we don't know you.
          </p>

          <CodeBlock
            title="Authentication Header"
            tabs={[
              {
                label: "cURL",
                value: "curl",
                language: "bash",
                code: `curl https://api.rateguard.io/v1/dashboard/stats \\
  -H "Authorization: Bearer rg_live_8f92a3..."`,
              },
              {
                label: "Node.js",
                value: "node",
                language: "javascript",
                code: `const response = await fetch('https://api.rateguard.io/v1/dashboard/stats', {
  headers: {
    'Authorization': 'Bearer rg_live_8f92a3...'
  }
});`,
              },
              {
                label: "Python",
                value: "python",
                language: "python",
                code: `import requests

headers = {
    'Authorization': 'Bearer rg_live_8f92a3...'
}
response = requests.get('https://api.rateguard.io/v1/dashboard/stats', headers=headers)`,
              },
              {
                label: "Go",
                value: "go",
                language: "go",
                code: `req, _ := http.NewRequest("GET", "https://api.rateguard.io/v1/dashboard/stats", nil)
req.Header.Set("Authorization", "Bearer rg_live_8f92a3...")
client := &http.Client{}
resp, _ := client.Do(req)`,
              },
            ]}
          />
        </section>

        {/* Security Warning */}
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Security Warning</AlertTitle>
          <AlertDescription>
            Never commit your API keys to GitHub. If you do, Michael Scott will
            personally come to your office and declare bankruptcy on your behalf.
          </AlertDescription>
        </Alert>

        {/* OAuth Section */}
        <Card className="flex flex-col opacity-60 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-6 w-6 text-primary" />
              <CardTitle>OAuth 2.0 (Coming Soon)</CardTitle>
            </div>
            <CardDescription>
              Delegated authorization for user-centric applications.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <p className="text-muted-foreground mb-6 flex-1">
              We are working on adding OAuth 2.0 support. It's currently in the
              "Ryan started the fire" phase of development (just kidding, it's
              going great).
            </p>
            <Button disabled variant="outline" className="w-full sm:w-auto">
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
