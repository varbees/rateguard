import { Metadata } from "next";
import Link from "next/link";
import { Shield, Key, Lock, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Authentication | RateGuard Documentation",
  description: "Secure your API requests with RateGuard authentication methods.",
};

export default function AuthenticationPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12">
        <div className="container max-w-5xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Authentication
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                RateGuard provides secure, industry-standard authentication methods
                to protect your API and ensure only authorized clients can access
                your resources.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-12 space-y-12">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-6 w-6 text-primary" />
                <CardTitle>API Keys</CardTitle>
              </div>
              <CardDescription>
                The primary method for server-to-server authentication.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <p className="text-muted-foreground mb-6 flex-1">
                Learn how to generate, manage, and rotate API keys. Understand
                permissions, scopes, and best practices for securing your keys in
                production environments.
              </p>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/docs/authentication/api-keys">
                  Read API Keys Guide <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col opacity-60">
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
                We are working on adding OAuth 2.0 support for more complex
                integration scenarios involving third-party applications and user
                consent flows.
              </p>
              <Button disabled variant="outline" className="w-full sm:w-auto">
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
