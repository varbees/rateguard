"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/lib/store";
import { apiClient } from "@/lib/api";
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  LogOut,
  Activity,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "APIs",
    href: "/dashboard/apis",
    icon: Activity,
  },
  {
    title: "Streaming",
    href: "/dashboard/streaming",
    icon: BarChart3,
  },
  {
    title: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
  },
  {
    title: "Billing",
    href: "/dashboard/billing",
    icon: CreditCard,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useDashboardStore((state) => state.clearAuth);

  const handleLogout = () => {
    apiClient.clearApiKey();
    clearAuth();
    router.push("/login");
  };

  return (
    <div className="flex flex-col h-full border-r border-slate-700 bg-slate-900 w-64">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <div className="p-2 bg-blue-500 rounded-lg">
            <Activity className="w-5 h-5 text-white" />
          </div>
          RateGuard
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                  isActive
                    ? "bg-blue-500 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.title}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-slate-700">
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
}
