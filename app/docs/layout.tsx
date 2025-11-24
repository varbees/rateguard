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
} from "lucide-react";
import { useDashboardStore } from "@/lib/store";
import FloatingSidebar from "@/components/layout/FloatingSidebar";

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
    title: "Features",
    items: [
      {
        title: "Rate Limit Discovery",
        href: "/docs/features/rate-limit-discovery",
        icon: TrendingUp,
      },
      {
        title: "Queue Management",
        href: "/docs/features/queue-management",
        icon: Layers,
      },
      {
        title: "Transparent Proxy",
        href: "/docs/features/transparent-proxy",
        icon: Activity,
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
  const isAuthenticated = useDashboardStore((state) => state.isAuthenticated);

  const NavItem = ({
    item,
  }: {
    item: { title: string; href: string; icon?: React.ElementType };
  }) => {
    const Icon = item.icon;
    const isActive = pathname === item.href;

    return (
      <Link href={item.href}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
            isActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
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
      {/* Show FloatingSidebar only when authenticated */}
      {isAuthenticated && <FloatingSidebar />}

      <div
        className={cn(
          "flex min-h-screen bg-background transition-all duration-300",
          isAuthenticated && "lg:ml-32"
        )}
      >
        {/* Left Sidebar - VS Code Style */}
        <aside className="hidden lg:flex w-64 border-r border-border bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex flex-col w-full">
            {/* Docs Header */}
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-foreground">Documentation</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Guides, references, and examples
              </p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-6">
              {docsNav.map((section) => (
                <div key={section.title} className="space-y-1">
                  {section.items ? (
                    <>
                      <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
          </div>
        </aside>

        {/* Center Content - Scrollable */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">{children}</div>
        </main>

        {/* Right Sidebar - Table of Contents (Desktop Only) */}
        <aside className="hidden 2xl:flex w-64 border-l border-border bg-card/30 backdrop-blur-sm shrink-0">
          <div className="sticky top-8 w-full p-6 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <TableOfContents key={pathname} />
          </div>
        </aside>
      </div>
    </>
  );
}
