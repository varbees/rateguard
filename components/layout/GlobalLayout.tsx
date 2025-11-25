"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useDashboardStore } from "@/lib/store";
import { LoadingPage } from "@/components/loading";
import FloatingSidebar from "./FloatingSidebar";
import UnifiedSidebar from "./UnifiedSidebar";
import { useUser } from "@/lib/hooks/use-api";

export function GlobalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated, setUser, isSidebarCollapsed } = useDashboardStore();
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Check if current page is a public auth page
  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  // Exclude floating sidebar for docs (has own layout)
  const isDocsPage = pathname.startsWith("/docs");

  const isHomePage = pathname === "/";
  const isPublicPage = isAuthPage || isDocsPage || isHomePage;

  // Use TanStack Query to fetch user
  const { data: userData, isLoading: isUserLoading, error: userError } = useUser();

  // Sync user data to store
  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData, setUser]);

  // Handle auth redirection
  useEffect(() => {
    // If we're done loading user data (or it failed)
    if (!isUserLoading) {
      setIsAuthChecking(false);

      // If we failed to load user and we're not on a public page, redirect
      if (userError && !isPublicPage && !isAuthenticated) {
        // Double check if we really aren't authenticated (store might have it)
        if (!user) {
          window.location.href = "/login";
        }
      }
    }
  }, [isUserLoading, userError, isPublicPage, isAuthenticated, user]);

  const loading = isAuthChecking && !isPublicPage && !isAuthenticated;

  // Show loading state while checking authentication
  if (loading) {
    return <LoadingPage text="Loading..." />;
  }

  // Exclude sidebar for the main landing page - no sidebar at all
  if (isHomePage) {
    return <>{children}</>;
  }

  // Don't render the floating sidebar for public auth pages, just the page content
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Don't render floating sidebar for docs (has its own layout)
  if (isDocsPage) {
    return <>{children}</>;
  }

  // If we are authenticated and ready, show the floating sidebar with content
  return (
    <>
      <UnifiedSidebar />
      <main 
        className={`min-h-screen bg-background transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? "lg:ml-[48px]" : "lg:ml-[240px]"
        }`}
      >
        <div className="container mx-auto p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </>
  );
}
