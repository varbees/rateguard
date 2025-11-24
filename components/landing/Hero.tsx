"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HERO_CONTENT } from "@/lib/constants";
import { fadeIn, staggerContainer } from "@/lib/animations";
import style from "styled-jsx/style";

/**
 * Hero Section
 * Features 3D animated background, headline, CTAs, and trust badges
 */

// Seeded random function for deterministic positioning
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export function Hero() {
  // Pre-generate particle positions using seeded random
  const particles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        left: seededRandom(i * 4 + 1) * 100,
        top: seededRandom(i * 4 + 2) * 100,
        delay: seededRandom(i * 4 + 3) * 3,
        duration: 2 + seededRandom(i * 4 + 4) * 2,
      })),
    []
  );

  // Pre-generate orb positions
  const orbs = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        left: 20 + seededRandom(i * 4 + 5) * 60,
        top: 20 + seededRandom(i * 4 + 6) * 60,
        delay: seededRandom(i * 4 + 7) * 4,
        duration: 4 + seededRandom(i * 4 + 8) * 2,
      })),
    []
  );

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Animated Background */}
      <div className="absolute inset-0 z-0">
        {/* Gradient background */}
        <div className="w-full h-full bg-gradient-to-br from-background via-muted to-background" />

        {/* Animated particles */}
        <div className="absolute inset-0">
          {particles.map((particle, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-primary/20 rounded-full animate-pulse"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`,
              }}
            />
          ))}
        </div>

        {/* Floating orbs */}
        <div className="absolute inset-0">
          {orbs.map((orb, i) => (
            <div
              key={`orb-${i}`}
              className="absolute w-32 h-32 bg-gradient-to-br from-primary/10 to-chart-2/10 rounded-full blur-xl animate-float"
              style={{
                left: `${orb.left}%`,
                top: `${orb.top}%`,
                animationDelay: `${orb.delay}s`,
                animationDuration: `${orb.duration}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background z-0" />

      {/* Content */}
      <motion.div
        variants={staggerContainer(0.1, 0.2)}
        initial="hidden"
        animate="show"
        className="relative z-10 container mx-auto px-4 py-20 text-center"
      >
        {/* Badge */}
        <motion.div variants={fadeIn("down", 0)} className="mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
            <Shield className="w-4 h-4" />
            Production-Grade API Rate Limiting
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeIn("up", 0.1)}
          className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 leading-tight"
        >
          {HERO_CONTENT.headline.split(". ").map((line, i) => (
            <span key={i} className="block">
              {line}
              {i === 0 && "."}
            </span>
          ))}
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          variants={fadeIn("up", 0.2)}
          className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-4xl mx-auto leading-relaxed"
        >
          {HERO_CONTENT.subheadline}
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeIn("up", 0.3)}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
        >
          <Link href="/signup">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-6 text-lg group"
            >
              {HERO_CONTENT.cta.primary}
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/docs">
            <Button
              size="lg"
              variant="outline"
              className="border-border bg-card/50 backdrop-blur-sm text-foreground hover:bg-accent hover:text-accent-foreground px-8 py-6 text-lg"
            >
              {HERO_CONTENT.cta.secondary}
            </Button>
          </Link>
        </motion.div>

        {/* Trust Badges */}
        <motion.div
          variants={fadeIn("up", 0.4)}
          className="flex flex-wrap items-center justify-center gap-6 text-muted-foreground"
        >
          {HERO_CONTENT.trustBadges.map((badge, i) => (
            <div key={i} className="flex items-center gap-2">
              <Check className="w-4 h-4 text-chart-3" />
              <span className="text-sm font-medium">{badge}</span>
            </div>
          ))}
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 1,
            duration: 0.5,
            repeat: Infinity,
            repeatType: "reverse",
          }}
          className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
        >
          <div className="w-6 h-10 rounded-full border-2 border-border flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-muted-foreground rounded-full animate-bounce" />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
