"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";
import ModernSidebar from "@/components/dashboard/ModernSidebar";
import { MobileHeader } from "@/components/dashboard/MobileNav";
import { LoadingPage } from "@/components/loading";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isAuthenticated = useDashboardStore((state) => state.isAuthenticated);
  const hasHydrated = useDashboardStore((state) => state._hasHydrated);

  useEffect(() => {
    // Redirect to login if not authenticated after hydration
    if (hasHydrated && !isAuthenticated) {
      router.push("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Show loading while waiting for hydration
  if (!hasHydrated) {
    return <LoadingPage text="Loading..." />;
  }

  // Show nothing while redirecting to login
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-950">
      {/* Modern Collapsible Sidebar - desktop only */}
      <ModernSidebar defaultCollapsed={false} />

      {/* Mobile Header - mobile only */}
      <MobileHeader />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
