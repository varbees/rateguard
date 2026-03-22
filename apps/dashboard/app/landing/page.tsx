"use client";

import { Toaster } from "sonner";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Footer } from "@/components/landing/Footer";
import { Comparison } from "@/components/landing/Comparison";
import { Testimonials } from "@/components/landing/Testimonials";
import { FAQ } from "@/components/landing/FAQ";

export default function LandingPage() {
  return (
    <>
      <div className="min-h-screen bg-background font-sans selection:bg-primary/20">
        <Header />
        
        <main className="overflow-hidden">
          <Hero />
          <HowItWorks />
          <Features />
          <Comparison />
          <Testimonials />
          <FAQ />
        </main>

        <Footer />
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
