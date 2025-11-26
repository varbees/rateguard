"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useDashboardStore } from "@/lib/store";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutGrid,
  Settings,
  CreditCard,
  LogOut,
  Server,
  BarChart3,
  Menu,
  ShieldCheck,
  LogIn,
  UserPlus,
  BookOpen,
  Moon,
  Sun,
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  PieChart,
  Activity,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

type NavItem = { title: string; href: string; icon: React.ComponentType<any> };

const loggedInNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { title: "APIs", href: "/dashboard/apis", icon: Server },
  { title: "Usage", href: "/dashboard/usage", icon: Activity },
  { title: "Queues", href: "/dashboard/queues", icon: List },
  { title: "Streaming", href: "/dashboard/streaming", icon: Zap },
  { title: "Analytics", href: "/dashboard/analytics", icon: PieChart },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

const docsNavItems: NavItem[] = [
  { title: "Documentation", href: "/docs", icon: BookOpen },
];

const loggedOutNavItems: NavItem[] = [
  { title: "Sign In", href: "/login", icon: LogIn },
  { title: "Sign Up", href: "/signup", icon: UserPlus },
];

interface NavLinkProps {
  item: NavItem;
  pathname: string;
  isSidebarCollapsed: boolean;
  onClick?: () => void;
}

function NavLink({
  item,
  pathname,
  isSidebarCollapsed,
  onClick,
}: NavLinkProps) {
  const Icon = item.icon;
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href));

  return (
    <Link href={item.href} onClick={onClick} className="block w-full">
      <div
        className={cn(
          "flex items-center gap-3 px-2 py-2 rounded-md transition-all duration-200 group relative overflow-hidden",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
          isSidebarCollapsed ? "justify-center" : "justify-start"
        )}
      >
        <Icon
          className={cn(
            "w-5 h-5 shrink-0 transition-transform duration-200",
            isActive && "scale-110"
          )}
        />

        <AnimatePresence mode="wait">
          {!isSidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="font-medium truncate whitespace-nowrap text-sm"
            >
              {item.title}
            </motion.span>
          )}
        </AnimatePresence>

        {isActive && (
          <motion.div
            layoutId="active-nav-indicator"
            className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </div>
    </Link>
  );
}

interface SidebarContentProps {
  isAuthenticated: boolean;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  theme?: string;
  setTheme: (theme: string) => void;
  user: { email?: string } | null;
  pathname: string;
  onNavClick: () => void;
  onLogout: () => void;
}

function SidebarContent({
  isAuthenticated,
  isSidebarCollapsed,
  toggleSidebar,
  theme,
  setTheme,
  user,
  pathname,
  onNavClick,
  onLogout,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div
        className={cn(
          "h-14 flex items-center border-b border-white/10",
          isSidebarCollapsed ? "justify-center px-0" : "justify-between px-3"
        )}
      >
        {!isSidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 overflow-hidden"
          >
            <div className="p-1 bg-primary/20 rounded-md">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-base tracking-tight truncate">
              RateGuard
            </span>
          </motion.div>
        )}
        {isSidebarCollapsed && (
          <div className="p-1 bg-primary/20 rounded-md">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-none">
        <TooltipProvider delayDuration={0}>
          {isAuthenticated
            ? loggedInNavItems.map((item) =>
                isSidebarCollapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <div>
                        <NavLink
                          item={item}
                          pathname={pathname}
                          isSidebarCollapsed={isSidebarCollapsed}
                          onClick={onNavClick}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="bg-popover text-popover-foreground border-border font-medium ml-2"
                    >
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onClick={onNavClick}
                  />
                )
              )
            : loggedOutNavItems.map((item) =>
                isSidebarCollapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <div>
                        <NavLink
                          item={item}
                          pathname={pathname}
                          isSidebarCollapsed={isSidebarCollapsed}
                          onClick={onNavClick}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="bg-popover text-popover-foreground border-border font-medium ml-2"
                    >
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onClick={onNavClick}
                  />
                )
              )}

          <div className="my-2 border-t border-white/10 mx-2" />

          {docsNavItems.map((item) =>
            isSidebarCollapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <div>
                    <NavLink
                      item={item}
                      pathname={pathname}
                      isSidebarCollapsed={isSidebarCollapsed}
                      onClick={onNavClick}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="bg-popover text-popover-foreground border-border font-medium ml-2"
                >
                  {item.title}
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                isSidebarCollapsed={isSidebarCollapsed}
                onClick={onNavClick}
              />
            )
          )}
        </TooltipProvider>
      </nav>

      {/* Footer Actions */}
      <div className="p-2 border-t border-white/10 space-y-1">
        {/* Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full h-9 text-muted-foreground hover:text-foreground hover:bg-white/5"
          title={isSidebarCollapsed ? "Expand" : "Collapse"}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>

        {/* Theme Toggle */}
        <TooltipProvider delayDuration={0}>
          {isSidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full h-9 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="ml-2">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-2 h-9 text-muted-foreground hover:text-foreground hover:bg-white/5"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              <span className="text-sm">Theme</span>
            </Button>
          )}
        </TooltipProvider>

        {/* User Profile / Logout */}
        {isAuthenticated && (
          <TooltipProvider delayDuration={0}>
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/dashboard/settings" className="block w-full">
                    <div className="flex items-center justify-center p-2 rounded-lg transition-colors hover:bg-white/5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-6 h-6 rounded-full border border-white/10 bg-background p-0.5"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="ml-2">
                  Settings
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-2 p-1 rounded-lg transition-colors hover:bg-white/5">
                <Link href="/dashboard/settings" className="shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6 rounded-full border border-white/10 bg-background p-0.5"
                  >
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </Link>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-medium truncate max-w-[120px]">
                    {user?.email}
                  </span>
                  <button
                    onClick={onLogout}
                    className="text-[10px] text-muted-foreground hover:text-destructive text-left transition-colors flex items-center gap-1"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export default function UnifiedSidebar() {
  const {
    isAuthenticated,
    user,
    clearAuth,
    isSidebarCollapsed,
    toggleSidebar,
  } = useDashboardStore();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      // Call backend logout to clear JWT cookie
      await apiClient.logout();
      // Clear frontend state
      clearAuth();
      // Redirect to landing page
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
      // Even if backend logout fails, clear frontend state
      clearAuth();
      router.push("/");
    }
  };

  const handleNavClick = () => setIsSheetOpen(false);

  return (
    <>
      {/* Desktop Sidebar - Glassmorphic & Grainy */}
      <motion.aside
        className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 bg-background/60 backdrop-blur-xl border-r border-white/10 shadow-xl"
        initial={false}
        animate={{ width: isSidebarCollapsed ? 48 : 240 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={
          {
            // Optional: Add a subtle noise texture if available, or just rely on backdrop blur
          }
        }
      >
        <SidebarContent
          isAuthenticated={isAuthenticated}
          isSidebarCollapsed={isSidebarCollapsed}
          toggleSidebar={toggleSidebar}
          theme={theme}
          setTheme={setTheme}
          user={user}
          pathname={pathname}
          onNavClick={handleNavClick}
          onLogout={handleLogout}
        />
      </motion.aside>

      {/* Mobile Header & Sheet */}
      <header className="lg:hidden sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center px-4 justify-between">
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="flex items-center gap-2"
          >
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">RateGuard</span>
          </Link>
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 p-0 border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl"
            >
              <div className="flex flex-col h-full">
                <div className="p-4 flex items-center justify-between border-b border-sidebar-border/50">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                    <span className="font-bold text-lg">RateGuard</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSheetOpen(false)}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                  {isAuthenticated
                    ? loggedInNavItems.map((item) => (
                        <NavLink
                          key={item.href}
                          item={item}
                          pathname={pathname}
                          isSidebarCollapsed={false}
                          onClick={handleNavClick}
                        />
                      ))
                    : loggedOutNavItems.map((item) => (
                        <NavLink
                          key={item.href}
                          item={item}
                          pathname={pathname}
                          isSidebarCollapsed={false}
                          onClick={handleNavClick}
                        />
                      ))}
                  <div className="my-4 border-t border-sidebar-border/50" />
                  {docsNavItems.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      isSidebarCollapsed={false}
                      onClick={handleNavClick}
                    />
                  ))}
                </nav>
                <div className="p-4 border-t border-sidebar-border/50 space-y-4">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {theme === "dark" ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )}
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </Button>
                  {isAuthenticated ? (
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
                      <Image
                        src={`data:image/svg+xml,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                            <rect width="32" height="32" fill="#e0e0e0"/>
                            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="16" fill="#333" font-family="Arial, sans-serif">
                              ${(user?.email?.[0] || "U").toUpperCase()}
                            </text>
                          </svg>`
                        )}`}
                        width={32}
                        height={32}
                        alt="User Avatar"
                        className="w-8 h-8 rounded-full"
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {user?.email}
                        </span>
                        <button
                          onClick={handleLogout}
                          className="text-xs text-muted-foreground hover:text-destructive text-left"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => router.push("/login")}
                    >
                      Sign In
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
