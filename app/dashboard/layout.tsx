"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";
import { useUser } from "@/lib/hooks/use-api";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { setUser } = useDashboardStore();
  const { data: user, isLoading, isError } = useUser();
  const [shouldRender, setShouldRender] = useState(false);

  // Immediate redirect for unauthorized users
  useEffect(() => {
    if (!isLoading) {
      if (user) {
        // User is authenticated - allow rendering
        setUser(user);
        setShouldRender(true);
      } else if (isError) {
        // API error occurred - redirect to login
        // This handles 401 (unauthorized) and other auth errors
        router.replace("/login");
      }
      // If user is null but no error, wait for data to load
      // This prevents redirect loops when API is temporarily unavailable
    }
  }, [user, isLoading, isError, router, setUser]);

  // Show nothing during initial auth check to prevent flash
  if (!shouldRender) {
    return null;
  }

  return <>{children}</>;
}
