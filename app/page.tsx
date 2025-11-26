"use client";

import { Toaster } from "sonner";
import dynamic from "next/dynamic";
import { Header } from "@/components/landing/Header";
import { PageLoader } from "@/components/PageLoader";
const Hero = dynamic(
  () => import("@/components/landing/Hero").then((mod) => mod.Hero),
  { ssr: false }
);
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
  return (
    <>
      <PageLoader />
      <div className="min-h-screen bg-background font-sans selection:bg-primary/20">
        <Header />

        <main className="overflow-hidden">
          {/* Fixed height Hero container to prevent CLS */}
          <div className="h-screen min-h-[600px] max-h-[1200px] flex flex-col justify-center">
            <Hero />
          </div>
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
