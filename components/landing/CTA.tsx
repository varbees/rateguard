"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CTA_SECTION } from "@/lib/constants";
import { fadeIn, zoomIn } from "@/lib/animations";

/**
 * CTA Section
 * Email capture form with validation and animated gradient background
 */

export function CTA() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast.success("Welcome! Redirecting to signup...", {
      description: "Check your email for a verification link",
    });

    // Redirect to signup with email pre-filled
    setTimeout(() => {
      router.push(`/signup?email=${encodeURIComponent(email)}`);
    }, 1500);
  };

  return (
    <section className="relative py-32 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 opacity-10">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
      </div>

      {/* Animated mesh gradient */}
      <motion.div
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%"],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: "reverse",
        }}
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.3) 0%, transparent 50%)",
          backgroundSize: "200% 200%",
        }}
      />

      <div className="relative container mx-auto px-4">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Headline */}
          <motion.h2
            variants={fadeIn("up", 0)}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6"
          >
            {CTA_SECTION.headline}
          </motion.h2>

          {/* Subheadline */}
          <motion.p
            variants={fadeIn("up", 0.1)}
            className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto"
          >
            {CTA_SECTION.subheadline}
          </motion.p>

          {/* Email Form */}
          <motion.form
            variants={zoomIn(0.2)}
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto"
          >
            <Input
              type="email"
              placeholder={CTA_SECTION.placeholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 px-6 py-6 text-lg bg-white/10 backdrop-blur-md border-white/20 text-foreground placeholder:text-muted-foreground focus:border-white/40 focus:ring-2 focus:ring-white/20"
            />
            <Button
              type="submit"
              size="lg"
              disabled={isLoading}
              className="bg-white text-slate-900 hover:bg-slate-100 px-8 py-6 text-lg font-semibold group"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {CTA_SECTION.button}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
          </motion.form>

          {/* Trust indicators */}
          <motion.p
            variants={fadeIn("up", 0.3)}
            className="text-sm text-muted-foreground mt-6"
          >
            No credit card required • Free forever • Cancel anytime
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
