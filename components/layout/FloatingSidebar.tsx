"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useDashboardStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  LogOut,
  Activity,
  BarChart3,
  Menu,
  ChevronLeft,
  ChevronRight,
  LogIn,
  UserPlus,
  BookOpen,
  Moon,
  Sun,
  Home,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const loggedInNavItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "APIs", href: "/dashboard/apis", icon: Activity },
  { title: "Usage", href: "/dashboard/usage", icon: BarChart3 },
  { title: "Queues", href: "/dashboard/queues", icon: BarChart3 },
  { title: "Streaming", href: "/dashboard/streaming", icon: Activity },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

// Public nav items - dynamic Home based on auth
const getPublicNavItems = (isAuthenticated: boolean) => [
  { title: "Home", href: isAuthenticated ? "/dashboard" : "/", icon: Home },
  { title: "Documentation", href: "/docs", icon: BookOpen },
];

const authNavItems = [
  { title: "Sign In", href: "/login", icon: LogIn },
  { title: "Sign Up", href: "/signup", icon: UserPlus },
];

export default function FloatingSidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isAuthenticated, user, clearAuth, isSidebarCollapsed, toggleSidebar } = useDashboardStore();
  const isExpanded = !isSidebarCollapsed;
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  // Close mobile sidebar when route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Close on escape key (mobile only)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const handleLogout = () => {
    clearAuth();
    setIsMobileOpen(false);
    router.push("/login");
  };

  const NavLink = ({
    item,
    collapsed = false,
  }: {
    item: { title: string; href: string; icon: React.ComponentType<any> };
    collapsed?: boolean;
  }) => {
    const Icon = item.icon;
    const isActive =
      pathname === item.href ||
      (item.href !== "/" &&
        item.href !== "/dashboard" &&
        pathname.startsWith(item.href));

    if (collapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={item.href}>
                <div
                  className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {item.title}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Link href={item.href}>
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent"
          )}
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="font-medium">{item.title}</span>
        </div>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Hamburger - Only visible on mobile */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          size="icon"
          className="h-12 w-12 rounded-xl bg-card border-2 border-border shadow-lg hover:bg-accent"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-card border-r border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <LayoutDashboard className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-foreground">
                    RateGuard
                  </h2>
                  {isAuthenticated && user && (
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Public Navigation */}
              <div className="space-y-1">
                {getPublicNavItems(isAuthenticated).map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>

              {/* Authenticated Navigation */}
              {isAuthenticated && (
                <>
                  <div className="pt-4 pb-2">
                    <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Dashboard
                    </p>
                  </div>
                  <div className="space-y-1">
                    {loggedInNavItems.map((item) => (
                      <NavLink key={item.href} item={item} />
                    ))}
                  </div>
                </>
              )}

              {/* Auth Links for logged out users */}
              {!isAuthenticated && (
                <>
                  <div className="pt-4 pb-2">
                    <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Account
                    </p>
                  </div>
                  <div className="space-y-1">
                    {authNavItems.map((item) => (
                      <NavLink key={item.href} item={item} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border space-y-2">
              {/* Theme Toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTheme(theme === "dark" ? "light" : "dark")
                      }
                      className="w-full justify-start gap-3"
                    >
                      {theme === "dark" ? (
                        <Sun className="h-4 w-4" />
                      ) : (
                        <Moon className="h-4 w-4" />
                      )}
                      <span className="font-medium">
                        {theme === "dark" ? "Light" : "Dark"} Mode
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Toggle theme</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Logout Button */}
              {isAuthenticated && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleLogout}
                  className="w-full justify-start gap-3"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="font-medium">Logout</span>
                </Button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar - Apple-style: Icon bar + Expandable names panel */}
      <motion.aside
        initial={false}
        animate={{
          width: isExpanded ? 288 : 64,
          left: 16,
          top: 16,
          bottom: 16,
        }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="hidden lg:flex fixed z-30 rounded-xl border border-border shadow-lg overflow-hidden"
      >
        {/* Icon Bar - Always visible (64px) */}
        <div className="w-16 flex flex-col bg-card/50 backdrop-blur-sm">
          {/* Logo Icon */}
          <div className="p-3 border-b border-border/50 flex items-center justify-center">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-primary" />
            </div>
          </div>

          {/* Toggle Button */}
          <div className="p-2 border-b border-border/50">
            <Button
              onClick={() => toggleSidebar()}
              variant="ghost"
              size="sm"
              className="w-full h-8 justify-center p-0"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  isExpanded && "rotate-180"
                )}
              />
            </Button>
          </div>

          {/* Icon Navigation */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Public Icons */}
            {getPublicNavItems(isAuthenticated).map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/" &&
                  item.href !== "/dashboard" &&
                  pathname.startsWith(item.href));
              return (
                <TooltipProvider key={item.href} delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={item.href}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "w-full h-10 justify-center p-0 transition-all",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                          )}
                        >
                          <Icon className="w-5 h-5" />
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}

            {/* Divider */}
            {isAuthenticated && (
              <div className="w-full h-px bg-border/50 my-2" />
            )}

            {/* Authenticated Icons */}
            {isAuthenticated &&
              loggedInNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href));
                return (
                  <TooltipProvider key={item.href} delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href={item.href}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "w-full h-10 justify-center p-0 transition-all",
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-accent"
                            )}
                          >
                            <Icon className="w-5 h-5" />
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}

            {/* Auth Icons for logged out */}
            {!isAuthenticated && (
              <>
                <div className="w-full h-px bg-border/50 my-2" />
                {authNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <TooltipProvider key={item.href} delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={item.href}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "w-full h-10 justify-center p-0 transition-all",
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-accent"
                              )}
                            >
                              <Icon className="w-5 h-5" />
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {item.title}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer Icons */}
          <div className="p-2 border-t border-border/50 space-y-1">
            {/* Theme Toggle Icon */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                    className="w-full h-10 justify-center p-0"
                  >
                    {theme === "dark" ? (
                      <Sun className="h-5 w-5" />
                    ) : (
                      <Moon className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Toggle theme</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Logout Icon */}
            {isAuthenticated && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="w-full h-10 justify-center p-0 text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Logout</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Names Panel - Slides from right (224px) - Apple-style */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 224, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="flex flex-col bg-card/95 backdrop-blur-md border-l border-border/50"
            >
              {/* Header with user info */}
              <div className="p-4 border-b border-border/50">
                <h2 className="font-semibold text-sm text-foreground">
                  RateGuard
                </h2>
                {isAuthenticated && user && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {user.email}
                  </p>
                )}
              </div>

              {/* Navigation Names */}
              <div className="flex-1 overflow-y-auto p-3 space-y-6">
                {/* Public Section */}
                <div className="space-y-1">
                  {getPublicNavItems(isAuthenticated).map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" &&
                        item.href !== "/dashboard" &&
                        pathname.startsWith(item.href));
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          )}
                        >
                          {item.title}
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Dashboard Section */}
                {isAuthenticated && (
                  <div className="space-y-1">
                    <p className="px-3 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
                      Dashboard
                    </p>
                    {loggedInNavItems.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== "/dashboard" &&
                          pathname.startsWith(item.href));
                      return (
                        <Link key={item.href} href={item.href}>
                          <div
                            className={cn(
                              "px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                          >
                            {item.title}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Auth Section */}
                {!isAuthenticated && (
                  <div className="space-y-1">
                    <p className="px-3 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
                      Account
                    </p>
                    {authNavItems.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link key={item.href} href={item.href}>
                          <div
                            className={cn(
                              "px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                          >
                            {item.title}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-3 border-t border-border/50 space-y-2">
                {/* Theme Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="w-full justify-start gap-2 h-9 font-medium text-xs"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </Button>

                {/* Logout */}
                {isAuthenticated && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full justify-start gap-2 h-9 font-medium text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
    </>
  );
}
