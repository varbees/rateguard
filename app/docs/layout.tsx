"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TableOfContents } from "@/components/docs/TableOfContents";
import {
  BookOpen,
  FileText,

  Shield,
  Zap,
  TrendingUp,
  Layers,
  Activity,
  Globe,
  CreditCard,
  Lock,
  BarChart,
} from "lucide-react";
import { useDashboardStore } from "@/lib/store";
import UnifiedSidebar from "@/components/layout/UnifiedSidebar";
import { DocsSearch } from "@/components/docs/DocsSearch";

// VS Code inspired docs navigation
const docsNav = [
  {
    title: "Introduction",
    items: [
      { title: "Welcome", href: "/docs", icon: BookOpen },
      { title: "Quickstart", href: "/docs/quickstart", icon: Zap },
      { title: "Supported Plans & Limits", href: "/docs/plans-and-limits", icon: CreditCard },
    ],
  },
  {
    title: "Concepts",
    items: [
      { title: "What is RateGuard?", href: "/docs/concepts/what-is-rateguard", icon: Shield },
      { title: "Core Architecture", href: "/docs/concepts/architecture", icon: Layers },
      { title: "Glossary", href: "/docs/concepts/glossary", icon: FileText },
    ],
  },
  {
    title: "Guides",
    items: [
      { title: "Setup & First Proxy", href: "/docs/guides/setup", icon: Zap },
      { title: "Connect Your LLM API", href: "/docs/guides/connect-llm", icon: Globe },
      { title: "Dashboard & Analytics", href: "/docs/guides/dashboard-analytics", icon: BarChart },
      { title: "Migrating from AWS/Kong", href: "/docs/guides/migration", icon: TrendingUp },
      { title: "Monitoring & Alerts", href: "/docs/guides/monitoring", icon: Activity },
      { title: "Debugging API Calls", href: "/docs/guides/debugging", icon: Activity },
    ],
  },
  {
    title: "Features",
    items: [
      { title: "API Rate Limiting", href: "/docs/features/distributed-rate-limiting", icon: Zap },
      { title: "LLM Token Tracking", href: "/docs/features/llm-token-tracking", icon: BarChart },
      { title: "Circuit Breakers", href: "/docs/features/circuit-breaker", icon: Shield },
      { title: "Priority Queuing", href: "/docs/features/queue-management", icon: Layers },
      { title: "Webhooks & Retries", href: "/docs/features/webhooks", icon: Activity },
      { title: "Billing & Usage", href: "/docs/features/billing", icon: CreditCard },
    ],
  },
  {
    title: "Integrations",
    items: [
      { title: "Common Frameworks", href: "/docs/integrations/frameworks", icon: Layers },
      { title: "LLM Providers", href: "/docs/integrations/llm-providers", icon: Globe },
      { title: "Third Party Tools", href: "/docs/integrations/third-party", icon: Activity },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Proxy API", href: "/docs/reference/proxy-api", icon: FileText },
      { title: "Token Analytics API", href: "/docs/reference/token-analytics-api", icon: BarChart },
      { title: "Webhook Schema", href: "/docs/reference/webhooks", icon: Activity },
    ],
  },
  {
    title: "FAQ",
    items: [
      { title: "Product", href: "/docs/faq/product", icon: BookOpen },
      { title: "Account & Billing", href: "/docs/faq/billing", icon: CreditCard },
      { title: "Support", href: "/docs/faq/support", icon: Activity },
      { title: "Security", href: "/docs/faq/security", icon: Lock },
    ],
  },
  {
    title: "Changelog",
    items: [
      { title: "Release Notes", href: "/docs/changelog", icon: FileText },
    ],
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isAuthenticated, isSidebarCollapsed } = useDashboardStore();

  const NavItem = ({
    item,
  }: {
    item: { title: string; href: string; icon?: React.ComponentType<{ className?: string }> };
  }) => {
    const Icon = item.icon;
    const isActive = pathname === item.href;

    return (
      <Link href={item.href}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all duration-200",
            isActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          <span>{item.title}</span>
        </div>
      </Link>
    );
  };

  return (
    <>
      {/* Show UnifiedSidebar only when authenticated */}
      {isAuthenticated && <UnifiedSidebar />}

      <div
        className={cn(
          "flex min-h-screen bg-background transition-all duration-300 ease-in-out",
          isAuthenticated ? (isSidebarCollapsed ? "lg:ml-[48px]" : "lg:ml-[240px]") : ""
        )}
      >
        {/* Left Sidebar - Glassmorphic Style */}
        <aside className="hidden lg:flex w-64 border-r border-border bg-card/30 backdrop-blur-xl shrink-0 sticky top-0 h-screen overflow-hidden flex-col">
          {/* Docs Header */}
          <div className="p-6 border-b border-border/50 bg-card/50 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                 <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-bold text-foreground tracking-tight">Documentation</h2>
            </div>
            <DocsSearch />
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {docsNav.map((section) => (
              <div key={section.title} className="space-y-1">
                {section.items && (
                  <>
                    <h4 className="px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      {section.title}
                    </h4>
                    {section.items.map((item) => (
                      <NavItem key={item.href} item={item} />
                    ))}
                  </>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Center Content - Scrollable */}
        <main className="flex-1 min-w-0">
          <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-12">{children}</div>
        </main>

        {/* Right Sidebar - Table of Contents (Desktop Only) */}
        <aside className="hidden 2xl:flex w-64 border-l border-border bg-card/20 backdrop-blur-sm shrink-0 sticky top-0 h-screen overflow-y-auto">
          <div className="w-full p-6">
            <TableOfContents key={pathname} />
          </div>
        </aside>
      </div>
    </>
  );
}
