"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Redirect page for /dashboard/apis/new
 * 
 * This page redirects to /dashboard/apis with modal=open parameter
 * to auto-open the API creation modal.
 * 
 * This approach:
 * - Fixes TypeScript errors from old form implementation
 * - Uses the canonical modal component for all API operations
 * - Maintains backward compatibility for bookmarked URLs
 * - Provides better UX with consistent modal interface
 */
export default function NewAPIRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to /dashboard/apis with modal parameter
    router.push("/dashboard/apis?modal=open");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
        <p className="text-slate-400">Redirecting to API management...</p>
      </div>
    </div>
  );
}
