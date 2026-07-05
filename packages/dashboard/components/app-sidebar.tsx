"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  LayoutDashboard,
  Plug,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useRateGuard } from "@/lib/rateguard-context";

const monitorItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/agents", label: "Agents", icon: Bot },
];

const operateItems = [
  { href: "/controls", label: "Controls", icon: SlidersHorizontal },
  { href: "/mcp", label: "MCP Console", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { status } = useRateGuard();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <ShieldCheck className="size-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">RateGuard</span>
                    <span className="text-xs text-muted-foreground">Control Center</span>
                  </div>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Monitor</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {monitorItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    render={
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operateItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    render={
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" className="cursor-default hover:bg-transparent">
              <span
                className="size-2 rounded-full"
                style={{
                  background:
                    status === "connected"
                      ? "var(--color-status-good)"
                      : status === "error"
                        ? "var(--color-status-critical)"
                        : "var(--color-status-warning)",
                }}
              />
              <span className="text-xs text-muted-foreground">
                {status === "connected" ? "Connected" : status === "error" ? "Disconnected" : "Connecting…"}
              </span>
            </SidebarMenuButton>
            {status === "connected" && <SidebarMenuBadge>live</SidebarMenuBadge>}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
