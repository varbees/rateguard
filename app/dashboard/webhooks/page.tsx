"use client";

import { motion } from "framer-motion";
import {
  Webhook,
  ArrowRight,
  Shield,
  RefreshCw,
  Clock,
  BookOpen,
  Sparkles,
  Zap,
} from "lucide-react";
import { WebhookStatsCards } from "@/components/dashboard/webhooks/WebhookStatsCards";
import { WebhookConfigCard } from "@/components/dashboard/webhooks/WebhookConfigCard";
import { WebhookEventsTable } from "@/components/dashboard/webhooks/WebhookEventsTable";
import { Button } from "@/components/ui/button";
import { useWebhookStats } from "@/lib/hooks/use-webhooks";
import Link from "next/link";

// Staggered animation for children
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

// Feature card for the sidebar
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// Empty state component for new users
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-8 md:p-12"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl" />

      <div className="relative max-w-2xl mx-auto text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6"
        >
          <Webhook className="w-8 h-8 text-primary" />
        </motion.div>

        <h3 className="text-2xl font-bold mb-3">Reliable Webhook Delivery</h3>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Never lose a webhook again. RateGuard ensures every event reaches its
          destination with automatic retries and dead letter queues.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Button size="lg" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Get Started
          </Button>
          <Button variant="outline" size="lg" className="gap-2" asChild>
            <Link href="/docs/features/webhooks">
              <BookOpen className="w-4 h-4" />
              View Documentation
            </Link>
          </Button>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm border">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
              <span className="text-sm font-bold text-blue-500">1</span>
            </div>
            <h4 className="font-medium mb-1">Configure Endpoint</h4>
            <p className="text-xs text-muted-foreground">
              Set up your webhook inbox URL and destination endpoint.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm border">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
              <span className="text-sm font-bold text-purple-500">2</span>
            </div>
            <h4 className="font-medium mb-1">Receive Events</h4>
            <p className="text-xs text-muted-foreground">
              Events from Stripe, GitHub, etc. flow through RateGuard.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm border">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
              <span className="text-sm font-bold text-emerald-500">3</span>
            </div>
            <h4 className="font-medium mb-1">Guaranteed Delivery</h4>
            <p className="text-xs text-muted-foreground">
              Automatic retries ensure your app never misses an event.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function WebhooksPage() {
  const { data: stats } = useWebhookStats(30000);
  const hasEvents = (stats?.database_stats?.total ?? 0) > 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-8"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Webhook className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Webhook Relay</h1>
          </div>
          <p className="text-muted-foreground">
            Reliable event delivery with automatic retries, circuit breakers,
            and dead letter queues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/docs/features/webhooks" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Docs
            </Link>
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants}>
        <WebhookStatsCards />
      </motion.div>

      {/* Main Content */}
      {!hasEvents ? (
        <motion.div variants={itemVariants}>
          <EmptyState />
        </motion.div>
      ) : (
        <motion.div
          variants={itemVariants}
          className="grid gap-6 lg:grid-cols-3"
        >
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            <WebhookConfigCard />
            <WebhookEventsTable />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Features */}
            <div className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Features
              </h3>
              <div className="space-y-1">
                <FeatureCard
                  icon={RefreshCw}
                  title="Automatic Retries"
                  description="Exponential backoff up to 6 attempts"
                />
                <FeatureCard
                  icon={Shield}
                  title="Circuit Breaker"
                  description="Protects endpoints from overload"
                />
                <FeatureCard
                  icon={Clock}
                  title="Dead Letter Queue"
                  description="Failed events saved for review"
                />
              </div>
            </div>

            {/* Quick Links */}
            <div className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-4">Quick Links</h3>
              <div className="space-y-2">
                <Link
                  href="/docs/features/webhooks"
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm group"
                >
                  <span>Documentation</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
                <Link
                  href="/docs/reference/webhooks"
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm group"
                >
                  <span>API Reference</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Show config even when empty (after empty state CTA is clicked) */}
      {!hasEvents && (
        <motion.div
          variants={itemVariants}
          className="grid gap-6 lg:grid-cols-3"
        >
          <div className="lg:col-span-2">
            <WebhookConfigCard />
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Features
            </h3>
            <div className="space-y-1">
              <FeatureCard
                icon={RefreshCw}
                title="Automatic Retries"
                description="Exponential backoff up to 6 attempts"
              />
              <FeatureCard
                icon={Shield}
                title="Circuit Breaker"
                description="Protects endpoints from overload"
              />
              <FeatureCard
                icon={Clock}
                title="Dead Letter Queue"
                description="Failed events saved for review"
              />
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
