"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "sonner";
import { useDashboardStore } from "@/lib/store";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { Comparison } from "@/components/landing/Comparison";
import { Testimonials } from "@/components/landing/Testimonials";
import { Team } from "@/components/landing/Team";
import { FAQ } from "@/components/landing/FAQ";
import { DwightBot } from "@/components/landing/DwightBot";

export default function LandingPage() {
  const router = useRouter();
  const isAuthenticated = useDashboardStore((state) => state.isAuthenticated);

  return (
    <>
      <div className="min-h-screen bg-background font-sans selection:bg-primary/20">
        <Header />
        
        <main className="overflow-hidden">
          <Hero />
          <HowItWorks />
          <Features />
          <Comparison />
          <Pricing />
          <Testimonials />
          <Team />
          <FAQ />
        </main>

        <Footer />
        <DwightBot />
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--card-foreground))",
          },
        }}
      />
    </>
  );
}
