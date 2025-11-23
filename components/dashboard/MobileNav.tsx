"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useDashboardStore } from "@/lib/store";
import { toasts } from "@/lib/toast";
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  LogOut,
  Activity,
  BarChart3,
  Menu,
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

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useDashboardStore((state) => state.clearAuth);

  const handleLogout = () => {
    clearAuth();
    toasts.auth.logoutSuccess();
    router.push("/login");
    setOpen(false);
  };

  const handleNavClick = () => {
    // Close menu on navigation
    setOpen(false);
  };

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 bg-slate-900 border-slate-800 p-0"
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="p-6 border-b border-slate-800">
              <SheetTitle className="text-left">
                <div className="flex items-center gap-2 text-white">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <Activity className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold">RateGuard</span>
                </div>
              </SheetTitle>
            </SheetHeader>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-3 px-4 py-4 rounded-lg transition-colors",
                        "min-h-[48px]", // Minimum touch target
                        isActive
                          ? "bg-blue-500 text-white"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white active:bg-slate-700"
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="font-medium">{item.title}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>

            {/* Logout Button */}
            <div className="p-4 border-t border-slate-800">
              <Button
                variant="ghost"
                className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800 h-12"
                onClick={handleLogout}
              >
                <LogOut className="w-5 h-5 mr-3" />
                Logout
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Mobile Header - Shows on mobile, hidden on desktop
 */
export function MobileHeader() {
  const pathname = usePathname();

  // Get page title from pathname
  const getPageTitle = () => {
    if (pathname === "/dashboard") return "Dashboard";
    if (pathname.includes("/apis")) return "APIs";
    if (pathname.includes("/streaming")) return "Streaming";
    if (pathname.includes("/analytics")) return "Analytics";
    if (pathname.includes("/billing")) return "Billing";
    if (pathname.includes("/settings")) return "Settings";
    return "RateGuard";
  };

  return (
    <header className="lg:hidden sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900/95 backdrop-blur supports-backdrop-filter:bg-slate-900/60">
      <div className="flex h-16 items-center px-4">
        <MobileNav />
        <h1 className="flex-1 text-center font-semibold text-white">
          {getPageTitle()}
        </h1>
        {/* Spacer for centering */}
        <div className="w-12" />
      </div>
    </header>
  );
}
