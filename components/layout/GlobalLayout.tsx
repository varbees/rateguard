"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";
import { LoadingPage } from "@/components/loading";
import FloatingSidebar from "./FloatingSidebar";

export function GlobalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useDashboardStore((state) => state.isAuthenticated);
  const hasHydrated = useDashboardStore((state) => state._hasHydrated);

  // Exclude sidebar for the main landing page - no sidebar at all
  if (pathname === "/") {
    return <>{children}</>;
  }

  // Exclude floating sidebar for docs (has own layout)
  const isDocsPage = pathname.startsWith("/docs");

  // Auth logic, moved from the old dashboard layout
  useEffect(() => {
    // We only want to redirect if the store has been hydrated and the user is not authenticated.
    // Also, we don't want to redirect on public auth pages or docs.
    const isAuthPage =
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/reset-password");

    const isPublicPage = isAuthPage || isDocsPage;

    if (hasHydrated && !isAuthenticated && !isPublicPage) {
      router.push("/login");
    }
  }, [hasHydrated, isAuthenticated, pathname, router, isDocsPage]);

  // While the Zustand store is rehydrating, show a loading state to prevent flicker
  if (!hasHydrated) {
    return <LoadingPage text="Initializing..." />;
  }

  // Don't render the floating sidebar for public auth pages, just the page content
  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

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
