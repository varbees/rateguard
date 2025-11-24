"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "sonner";
import { useDashboardStore } from "@/lib/store";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { ValueProposition } from "@/components/landing/SocialProof";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CodeExample } from "@/components/landing/CodeExample";
import { Pricing } from "@/components/landing/Pricing";
import { TechStack } from "@/components/landing/TechStack";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

/**
 * RateGuard Landing Page
 * Production-grade landing page with animations, 3D effects, and modern design
 *
 * Sections:
 * 1. Hero - 3D animated background with CTAs
 * 2. Social Proof - Tech company logos
 * 3. Features - 6 feature cards with glassmorphism
 * 4. How It Works - 3-step process with code examples
 * 5. Code Example - Before/After comparison
 * 6. Pricing - 3-tier pricing cards
 * 7. Tech Stack - Technology badges
 * 8. CTA - Email capture form
 * 9. Footer - Links and branding
 */

export default function LandingPage() {
  const router = useRouter();
  const isAuthenticated = useDashboardStore((state) => state.isAuthenticated);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    // if (isAuthenticated) {
    //   router.push("/dashboard");
    // }
  }, [isAuthenticated, router]);

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Fixed Header */}
        <Header />

        {/* Main Content */}
        <main>
          <Hero />
          <ValueProposition />
          <Features />
          <HowItWorks />
          <CodeExample />
          <Pricing />
          <TechStack />
          <CTA />
        </main>

        {/* Footer */}
        <Footer />
      </div>

      {/* Toast Notifications */}
      <Toaster
        position="top-right"
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
