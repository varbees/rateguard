"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";
import { Loader2 } from "lucide-react";
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
    if (!isLoading && !user) {
      // User is not authenticated - redirect immediately
      router.replace("/login");
      return;
    }

    if (user) {
      // User is authenticated - allow rendering
      setUser(user);
      setShouldRender(true);
    }
  }, [user, isLoading, router, setUser]);

  // Show nothing during initial auth check to prevent flash
  if (!shouldRender) {
    return null;
  }

  return <>{children}</>;
}
