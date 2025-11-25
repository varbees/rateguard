"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useDashboardStore } from "@/lib/store";
import { LoadingPage } from "@/components/loading";
import FloatingSidebar from "./FloatingSidebar";
import { apiClient } from "@/lib/api";

export function GlobalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated, setUser } = useDashboardStore();
  const [loading, setLoading] = useState(true);

  // Check if current page is a public auth page
  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  // Exclude floating sidebar for docs (has own layout)
  const isDocsPage = pathname.startsWith("/docs");

  const isPublicPage = isAuthPage || isDocsPage;
  const isHomePage = pathname === "/";

  // Auth logic - load user data if needed
  useEffect(() => {
    async function loadUser() {
      // Skip loading for public pages
      if (isPublicPage) {
        setLoading(false);
        return;
      }

      // If user is already loaded, skip
      if (user && isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        // Try to get current user from JWT cookie
        const userData = await apiClient.getCurrentUser();
        setUser(userData);
        setLoading(false);
      } catch (error) {
        console.error("Failed to load user:", error);
        // Only redirect to login if not on a public page
        if (!isPublicPage) {
          window.location.href = "/login";
        } else {
          setLoading(false);
        }
      }
    }

    loadUser();
  }, [pathname, isPublicPage, user, isAuthenticated, setUser]);

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
      <FloatingSidebar />
      <main className="min-h-screen bg-background lg:ml-72 transition-all duration-300">
        <div className="container mx-auto p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </>
  );
}
