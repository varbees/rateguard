"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { PageTransition } from "@/components/page-transition";
import { RateGuardProvider } from "@/lib/rateguard-context";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <RateGuardProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
              <PageTransition>{children}</PageTransition>
            </div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </RateGuardProvider>
  );
}
