"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useDashboardStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  ChevronLeft,
  ChevronRight,
  Menu,
  ShieldCheck,
  LogIn,
  UserPlus,
  BookOpen,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

const loggedInNavItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "APIs", href: "/dashboard/apis", icon: Activity },
  { title: "Usage", href: "/dashboard/usage", icon: BarChart3 },
  { title: "Streaming", href: "/dashboard/streaming", icon: Activity },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
];

const docsNavItems = [
  { title: "Documentation", href: "/docs", icon: BookOpen },
];

const loggedOutNavItems = [
  { title: "Sign In", href: "/login", icon: LogIn },
  { title: "Sign Up", href: "/signup", icon: UserPlus },
];

export default function UnifiedSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const { isAuthenticated, user, clearAuth } = useDashboardStore();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const NavLink = ({
    item,
  }: {
    item: { title: string; href: string; icon: React.ElementType };
  }) => {
    const Icon = item.icon;
    const isActive =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href));
    return (
      <Link href={item.href} onClick={() => setIsSheetOpen(false)}>
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Icon className="w-5 h-5 shrink-0" />
          {!isCollapsed && (
            <span className="font-medium truncate">{item.title}</span>
          )}
        </div>
      </Link>
    );
  };

  const CollapsedNavLink = ({
    item,
  }: {
    item: { title: string; href: string; icon: React.ElementType };
  }) => {
    const Icon = item.icon;
    const isActive =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href));
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={item.href}>
            <div
              className={cn(
                "flex items-center justify-center h-12 w-12 rounded-lg transition-colors mx-auto",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="bg-popover text-popover-foreground border-border"
        >
          <p>{item.title}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        <div
          className={cn("flex items-center gap-2", isCollapsed && "mx-auto")}
        >
          <div className="p-2 bg-sidebar-primary rounded-lg">
            <ShieldCheck className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!isCollapsed && (
            <h1 className="text-xl font-bold text-sidebar-foreground">
              RateGuard
            </h1>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <TooltipProvider delayDuration={0}>
          {isAuthenticated
            ? loggedInNavItems.map((item) =>
                isCollapsed ? (
                  <CollapsedNavLink key={item.href} item={item} />
                ) : (
                  <NavLink key={item.href} item={item} />
                )
              )
            : loggedOutNavItems.map((item) =>
                isCollapsed ? (
                  <CollapsedNavLink key={item.href} item={item} />
                ) : (
                  <NavLink key={item.href} item={item} />
                )
              )}
          <div className="!mt-4 border-t border-sidebar-border my-2 pt-2">
            {docsNavItems.map((item) =>
              isCollapsed ? (
                <CollapsedNavLink key={item.href} item={item} />
              ) : (
                <NavLink key={item.href} item={item} />
              )
            )}
          </div>
        </TooltipProvider>
      </nav>

      {/* Theme Toggle */}
      <div className="p-3 border-t border-sidebar-border">
        {isCollapsed ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 mx-auto text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <Sun className="w-5 h-5" />
                  ) : (
                    <Moon className="w-5 h-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="bg-popover text-popover-foreground border-border"
              >
                <p>{theme === "dark" ? "Light Mode" : "Dark Mode"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-5 h-5 mr-3" /> Light Mode
              </>
            ) : (
              <>
                <Moon className="w-5 h-5 mr-3" /> Dark Mode
              </>
            )}
          </Button>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        {isAuthenticated && (
          <TooltipProvider delayDuration={0}>
            <div
              className={cn(
                "flex items-center gap-3 px-2 py-2",
                isCollapsed && "justify-center"
              )}
            >
              <Link href="/dashboard/settings">
                <Image
                  src={`https://api.dicebear.com/7.x/initials/svg?seed=${
                    user?.email || "U"
                  }`}
                  width={32}
                  height={32}
                  alt="User Avatar"
                  className="w-8 h-8 rounded-full border-2 border-sidebar-border"
                />
              </Link>
              {!isCollapsed && (
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-sidebar-foreground truncate">
                    {user?.email}
                  </span>
                </div>
              )}
            </div>
          </TooltipProvider>
        )}
        {isCollapsed ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 mx-auto text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent mt-2"
                  onClick={
                    isAuthenticated ? handleLogout : () => router.push("/login")
                  }
                  aria-label={isAuthenticated ? "Logout" : "Login"}
                >
                  {isAuthenticated ? (
                    <LogOut className="w-5 h-5" />
                  ) : (
                    <LogIn className="w-5 h-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="bg-popover text-popover-foreground border-border"
              >
                <p>{isAuthenticated ? "Logout" : "Login"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent mt-2"
            onClick={
              isAuthenticated ? handleLogout : () => router.push("/login")
            }
          >
            {isAuthenticated ? (
              <>
                <LogOut className="w-5 h-5 mr-3" /> Logout
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5 mr-3" /> Login
              </>
            )}
          </Button>
        )}
      </div>
      {/* Toggle Button */}
      <div className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-10 w-10 text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent mx-auto block"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={cn(
          "hidden lg:flex transition-all duration-300 ease-in-out",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        {sidebarContent}
      </div>

      {/* Mobile Header & Sheet */}
      <header className="lg:hidden sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="flex h-16 items-center px-4 justify-between">
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="flex items-center gap-2"
          >
            <div className="p-2 bg-primary rounded-lg">
              <ShieldCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">RateGuard</h1>
          </Link>
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 bg-sidebar border-sidebar-border p-0"
            >
              {/* We need to render a non-collapsible version for the sheet */}
              <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="p-4 border-b border-sidebar-border">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-sidebar-primary rounded-lg">
                      <ShieldCheck className="w-5 h-5 text-sidebar-primary-foreground" />
                    </div>
                    <h1 className="text-xl font-bold text-sidebar-foreground">
                      RateGuard
                    </h1>
                  </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1">
                  {isAuthenticated
                    ? loggedInNavItems.map((item) => (
                        <NavLink key={item.href} item={item} />
                      ))
                    : loggedOutNavItems.map((item) => (
                        <NavLink key={item.href} item={item} />
                      ))}
                  <div className="!mt-4 border-t border-sidebar-border my-2 pt-2">
                    {docsNavItems.map((item) => (
                      <NavLink key={item.href} item={item} />
                    ))}
                  </div>
                </nav>

                {/* Theme Toggle */}
                <div className="p-3 border-t border-sidebar-border">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {theme === "dark" ? (
                      <>
                        <Sun className="w-5 h-5 mr-3" /> Light Mode
                      </>
                    ) : (
                      <>
                        <Moon className="w-5 h-5 mr-3" /> Dark Mode
                      </>
                    )}
                  </Button>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-sidebar-border">
                  {isAuthenticated && (
                    <div className="flex items-center gap-3 px-2 py-2">
                      <Link href="/dashboard/settings">
                        <img
                          src={`https://api.dicebear.com/7.x/initials/svg?seed=${
                            user?.email || "U"
                          }`}
                          alt="User Avatar"
                          className="w-8 h-8 rounded-full border-2 border-sidebar-border"
                        />
                      </Link>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-sidebar-foreground truncate">
                          {user?.email}
                        </span>
                      </div>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent mt-2"
                    onClick={
                      isAuthenticated
                        ? handleLogout
                        : () => {
                            router.push("/login");
                            setIsSheetOpen(false);
                          }
                    }
                  >
                    {isAuthenticated ? (
                      <>
                        <LogOut className="w-5 h-5 mr-3" /> Logout
                      </>
                    ) : (
                      <>
                        <LogIn className="w-5 h-5 mr-3" /> Login
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
