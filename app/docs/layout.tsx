"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TableOfContents } from "@/components/docs/TableOfContents";
import {
  BookOpen,
  FileText,
  Key,
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
  { title: "Introduction", href: "/docs", icon: BookOpen },
  {
    title: "Getting Started",
    items: [
      { title: "Authentication", href: "/docs/authentication", icon: Key },
      {
        title: "API Keys",
        href: "/docs/authentication/api-keys",
        icon: Shield,
      },
    ],
  },
  {
    title: "Guides",
    items: [
      { title: "Rate Limiting", href: "/docs/guides/rate-limiting", icon: Zap },
    ],
  },
  {
    title: "Core Features",
    items: [
      {
        title: "Transparent Proxy",
        href: "/docs/features/transparent-proxy",
        icon: Globe,
      },
      {
        title: "Multi-Tier Rate Limiting",
        href: "/docs/features/distributed-rate-limiting",
        icon: Zap,
      },
      {
        title: "Intelligent Queuing",
        href: "/docs/features/queue-management",
        icon: Layers,
      },
      {
        title: "Real-Time Analytics",
        href: "/docs/features/real-time-analytics",
        icon: BarChart,
      },
      {
        title: "Secure Credentials",
        href: "/docs/features/secure-credentials",
        icon: Lock,
      },
      {
        title: "Automatic Retry",
        href: "/docs/features/automatic-retry",
        icon: Activity,
      },
    ],
  },
  {
    title: "Advanced Features",
    items: [
      {
        title: "Circuit Breaker",
        href: "/docs/features/circuit-breaker",
        icon: Shield,
      },
      {
        title: "Health Checks",
        href: "/docs/features/health-checks",
        icon: Activity,
      },
      {
        title: "Rate Limit Discovery",
        href: "/docs/features/rate-limit-discovery",
        icon: TrendingUp,
      },
      {
        title: "Queue Observability",
        href: "/docs/features/queue-observability",
        icon: BarChart,
      },
    ],
  },
  {
    title: "Business Features",
    items: [
      {
        title: "Plan Enforcement",
        href: "/docs/features/plan-enforcement",
        icon: Lock,
      },
      {
        title: "Geo-Currency Detection",
        href: "/docs/features/geo-currency",
        icon: Globe,
      },
      {
        title: "Payment Gateways",
        href: "/docs/features/payment-gateways",
        icon: CreditCard,
      },
    ],
  },
  { title: "API Reference", href: "/docs/api-reference", icon: FileText },
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
    item: { title: string; href: string; icon?: React.ComponentType<any> };
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
                {section.items ? (
                  <>
                    <h4 className="px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      {section.title}
                    </h4>
                    {section.items.map((item) => (
                      <NavItem key={item.href} item={item} />
                    ))}
                  </>
                ) : (
                  <NavItem item={section as any} />
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Center Content - Scrollable */}
        <main className="flex-1 min-w-0">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 py-12">{children}</div>
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
