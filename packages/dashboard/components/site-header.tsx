"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatusPill } from "@/components/status-pill";
import { useRateGuard } from "@/lib/rateguard-context";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/analytics": "Analytics",
  "/agents": "Agents",
  "/controls": "Controls",
  "/mcp": "MCP Console",
  "/settings": "Settings",
};

// The dashboard's demo stack (docker compose up) seeds this exact key —
// anyone connected with it is looking at synthetic traffic, not a real
// instance, and that distinction needs to be impossible to miss.
const DEMO_KEY = "demo:demo:demo:demo:demo";

export function SiteHeader() {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "RateGuard";
  const { target, reqKey } = useRateGuard();
  const isDemo = reqKey === DEMO_KEY;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b">
      <div className="flex flex-1 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Link
          href="/settings"
          className="ml-3 hidden items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          title="Change which instance the dashboard is connected to"
        >
          <span className="size-1.5 rounded-full bg-current opacity-60" />
          <span className="font-mono">{target.replace(/^https?:\/\//, "")}</span>
          <span className="opacity-40">·</span>
          <span className="font-mono">{reqKey}</span>
        </Link>
        {isDemo && <StatusPill label="DEMO DATA" tone="warning" />}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
