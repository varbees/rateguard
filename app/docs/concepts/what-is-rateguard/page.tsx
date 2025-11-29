import { Metadata } from "next";
import { Shield, Zap, Globe, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "What is RateGuard? | RateGuard Documentation",
  description: "An overview of what RateGuard is and why you need it.",
};

export default function WhatIsRateGuardPage() {
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
              What is RateGuard?
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              RateGuard is the bouncer for your API. It keeps the riff-raff out
              and lets the VIPs in.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* The Problem */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">The Problem</h2>
          <p className="text-lg text-muted-foreground">
            You built an amazing API. It's fast, it's powerful, and everyone wants to use it.
            But then, <em>that one guy</em> decides to write a script that hits your endpoint 10,000 times a second.
            Your server catches fire, your database cries, and your AWS bill looks like a phone number.
          </p>
        </section>

        {/* The Solution */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">The Solution</h2>
          <p className="text-lg text-muted-foreground">
            RateGuard sits between your users and your API. It intercepts every request, checks if the user has permission (and budget), and either lets it through or tells them to cool it.
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="size-5 text-primary" />
                  Rate Limiting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Stop abuse before it hits your servers. Set limits by IP, user, or custom keys.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-5 text-primary" />
                  Global Edge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Distributed across the globe (thanks to Redis and some magic), so latency is minimal.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="size-5 text-primary" />
                  Plan Enforcement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Automatically enforce limits based on your user's subscription tier (Free, Pro, Enterprise).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="size-5 text-primary" />
                  Circuit Breaking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  If your backend goes down, we stop sending traffic so it can recover. Like a good friend.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Why RateGuard? */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Why RateGuard?</h2>
          <p className="text-lg text-muted-foreground">
            Because building this yourself is a pain. You have to deal with Redis race conditions, distributed counters, and clock synchronization.
            We did all that boring stuff so you can focus on building your actual product.
          </p>
          <p className="text-lg text-muted-foreground">
            Plus, our dashboard is really pretty.
          </p>
        </section>
      </div>
    </div>
  );
}
