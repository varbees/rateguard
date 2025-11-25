"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setUser, user } = useDashboardStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only load user if not already loaded
    if (user) {
      setLoading(false);
      return;
    }

    async function loadUser() {
      try {
        // Fetch current user from JWT cookie
        const userData = await apiClient.getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error("Failed to load user:", error);
        // Redirect to login if unauthorized
        window.location.href = "/login";
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [setUser, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
