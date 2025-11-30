"use client";

import { useState, useEffect } from "react";
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
  Users,
  Key,
  ChevronDown,
  Plus,
  Star,
  Bell,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<any>;
  description?: string;
  children?: NavItem[];
  disabled?: boolean;
  tooltip?: string;
};

const primaryNavItems: NavItem[] = [
  {
    title: "Overview",
    href: "/dashboard/overview",
    icon: LayoutGrid,
    description: "Your account at a glance",
  },
  {
    title: "APIs / Proxies",
    href: "/dashboard/apis",
    icon: Server,
    description: "Manage & observe all your RateGuard API gateways",
    children: [
      {
        title: "Create New API",
        href: "/dashboard/apis/new",
        icon: Plus,
      },
      // Recent/Starred APIs could be dynamically added here
    ],
  },
  {
    title: "Usage / Analytics",
    href: "/dashboard/usage",
    icon: Activity,
    description: "Live and historical traffic",
  },
  {
    title: "Live Events",
    href: "/dashboard/events",
    icon: Zap,
    description: "Real-time event stream and alerts",
  },
];

const secondaryNavItems: NavItem[] = [
  {
    title: "Billing & Plan",
    href: "/dashboard/billing",
    icon: CreditCard,
    description: "Current plan, quota, usage",
  },
  {
    title: "Team & Access",
    href: "/dashboard/team",
    icon: Users,
    description: "Invite team, share API keys",
    disabled: true,
    tooltip: "Not available for your plan (coming soon)",
  },
];

const accountNavItems: NavItem[] = [
  {
    title: "Account Settings",
    href: "/dashboard/account",
    icon: Settings,
    description: "Profile, notifications, security",
  },
  {
    title: "API Keys",
    href: "/dashboard/account/keys",
    icon: Key,
    description: "Rotate/regenerate authentication tokens",
  },
  {
    title: "Docs & Help",
    href: "/docs",
    icon: BookOpen,
    description: "Quick start, API reference",
  },
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
  depth?: number;
}

function NavLink({
  item,
  pathname,
  isSidebarCollapsed,
  onClick,
  depth = 0,
}: NavLinkProps) {
  const Icon = item.icon;
  const isActive =
    !item.disabled &&
    (pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href)));
  const [isOpen, setIsOpen] = useState(false);

  // Auto-expand if child is active
  useEffect(() => {
    if (item.children?.some((child) => pathname.startsWith(child.href))) {
      setIsOpen(true);
    }
  }, [pathname, item.children]);

  const hasChildren = item.children && item.children.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    if (item.disabled) {
      e.preventDefault();
      return;
    }
    if (hasChildren && !isSidebarCollapsed) {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (onClick) {
      onClick();
    }
  };

  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-2 py-2 rounded-md transition-all duration-200 group relative overflow-hidden",
        isActive
          ? "bg-primary/10 text-primary"
          : item.disabled
          ? "text-muted-foreground/50 cursor-not-allowed"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        isSidebarCollapsed ? "justify-center" : "justify-start",
        depth > 0 && "ml-4"
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
            className="font-medium truncate whitespace-nowrap text-sm flex-1"
          >
            {item.title}
          </motion.span>
        )}
      </AnimatePresence>

      {!isSidebarCollapsed && hasChildren && (
        <ChevronDown
          className={cn(
            "w-4 h-4 transition-transform duration-200",
            isOpen ? "rotate-180" : ""
          )}
        />
      )}

      {isActive && (
        <motion.div
          layoutId="active-nav-indicator"
          className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: -10 }}
        />
      )}
    </div>
  );

  if (item.disabled) {
    return (
      <div className="w-full">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="block w-full cursor-not-allowed">{content}</div>
          </TooltipTrigger>
          <TooltipContent side="right" className="ml-2">
            {item.tooltip || "Not available"}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Link
        href={hasChildren && !isSidebarCollapsed ? "#" : item.href}
        onClick={handleClick}
        className="block w-full"
      >
        {content}
      </Link>

      {/* Nested Items */}
      <AnimatePresence>
        {!isSidebarCollapsed && hasChildren && isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {item.children!.map((child) => (
              <NavLink
                key={child.href}
                item={child}
                pathname={pathname}
                isSidebarCollapsed={isSidebarCollapsed}
                onClick={onClick}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const renderNavItems = (items: NavItem[]) => {
    return items.map((item) =>
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
            {item.disabled ? item.tooltip : item.title}
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
    );
  };

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
      <nav className="flex-1 py-4 px-2 space-y-6 overflow-y-auto overflow-x-hidden scrollbar-none">
        <TooltipProvider delayDuration={0}>
          {isAuthenticated ? (
            <>
              {/* Primary Section */}
              <div className="space-y-1">
                {!isSidebarCollapsed && (
                  <h3 className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                    Primary
                  </h3>
                )}
                {renderNavItems(primaryNavItems)}
              </div>

              {/* Secondary Section */}
              <div className="space-y-1">
                {!isSidebarCollapsed && (
                  <h3 className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                    Secondary
                  </h3>
                )}
                {renderNavItems(secondaryNavItems)}
              </div>

              {/* Account Section */}
              <div className="space-y-1">
                {!isSidebarCollapsed && (
                  <h3 className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                    Account
                  </h3>
                )}
                {renderNavItems(accountNavItems)}
              </div>
            </>
          ) : (
            <div className="space-y-1">{renderNavItems(loggedOutNavItems)}</div>
          )}
        </TooltipProvider>
      </nav>

      {/* Footer Actions */}
      <div className="p-2 border-t border-white/10 space-y-1 bg-black/20">
        {/* Plan Badge (Optional/Pro) */}
        {!isSidebarCollapsed && isAuthenticated && (
          <div className="px-2 py-2 mb-2 rounded-md bg-gradient-to-r from-primary/20 to-purple-500/20 border border-primary/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary">Pro Plan</span>
              <Link
                href="/dashboard/billing"
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                Upgrade
              </Link>
            </div>
          </div>
        )}

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
                  <Link href="/dashboard/account" className="block w-full">
                    <div className="flex items-center justify-center p-2 rounded-lg transition-colors hover:bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                        {(user?.email?.[0] || "U").toUpperCase()}
                      </div>
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="ml-2">
                  Account Settings
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-2 p-1 rounded-lg transition-colors hover:bg-white/5">
                <Link href="/dashboard/account" className="shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary border border-primary/10">
                    {(user?.email?.[0] || "U").toUpperCase()}
                  </div>
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
        animate={{ width: isSidebarCollapsed ? 60 : 260 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
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
            href={isAuthenticated ? "/dashboard/overview" : "/"}
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
                <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
                  {isAuthenticated ? (
                    <>
                      <div className="space-y-1">
                        <h3 className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                          Primary
                        </h3>
                        {primaryNavItems.map((item) => (
                          <NavLink
                            key={item.href}
                            item={item}
                            pathname={pathname}
                            isSidebarCollapsed={false}
                            onClick={handleNavClick}
                          />
                        ))}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                          Secondary
                        </h3>
                        {secondaryNavItems.map((item) => (
                          <NavLink
                            key={item.href}
                            item={item}
                            pathname={pathname}
                            isSidebarCollapsed={false}
                            onClick={handleNavClick}
                          />
                        ))}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                          Account
                        </h3>
                        {accountNavItems.map((item) => (
                          <NavLink
                            key={item.href}
                            item={item}
                            pathname={pathname}
                            isSidebarCollapsed={false}
                            onClick={handleNavClick}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      {loggedOutNavItems.map((item) => (
                        <NavLink
                          key={item.href}
                          item={item}
                          pathname={pathname}
                          isSidebarCollapsed={false}
                          onClick={handleNavClick}
                        />
                      ))}
                    </div>
                  )}
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
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary border border-primary/10">
                        {(user?.email?.[0] || "U").toUpperCase()}
                      </div>
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
