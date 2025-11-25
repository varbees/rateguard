"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, Lock, LayoutDashboard } from "lucide-react";
import confetti from "canvas-confetti";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDashboardStore } from "@/lib/store";
import { useUser } from "@/lib/hooks/use-api";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, PerspectiveCamera, Environment } from "@react-three/drei";
import * as THREE from "three";

function FloatingAPIKey() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef}>
        <boxGeometry args={[1, 0.6, 0.1]} />
        <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
      </mesh>
    </Float>
  );
}

function BackgroundScene() {
  return (
    <div className="absolute inset-0 -z-10 opacity-30">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <Environment preset="city" />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        {Array.from({ length: 20 }).map((_, i) => (
          <Float key={i} speed={1 + Math.random()} rotationIntensity={1} floatIntensity={1} position={[
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 5
          ]}>
            <mesh rotation={[Math.random() * Math.PI, Math.random() * Math.PI, 0]}>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshStandardMaterial color={Math.random() > 0.5 ? "#3b82f6" : "#10b981"} transparent opacity={0.6} />
            </mesh>
          </Float>
        ))}
      </Canvas>
    </div>
  );
}

import gsap from "gsap";

export function Hero() {
  const router = useRouter();
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 200]);
  
  // Auth state
  const isAuthenticated = useDashboardStore((state) => state.isAuthenticated);
  const setUser = useDashboardStore((state) => state.setUser);
  const { data: user } = useUser();

  // Update store when user data is available
  useEffect(() => {
    if (user) {
      setUser(user);
    }
  }, [user, setUser]);

  useEffect(() => {
    if (!headlineRef.current) return;

    const chars = headlineRef.current.querySelectorAll(".char");
    
    // Kill any existing tweens to prevent conflicts
    gsap.killTweensOf(chars);

    gsap.fromTo(chars, 
      { 
        opacity: 0, 
        y: 100, 
        rotateZ: 10 
      },
      { 
        opacity: 1, 
        y: 0, 
        rotateZ: 0, 
        stagger: 0.02, 
        duration: 1, 
        ease: "back.out(1.7)",
        delay: 0.2
      }
    );
  }, []);

  const handleConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#3b82f6', '#10b981', '#f59e0b']
    });
  };

  return (
    <section ref={containerRef} className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      <BackgroundScene />
      
      <div className="container px-4 md:px-6 relative z-10">
        <div className="flex flex-col items-center text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium bg-background/50 backdrop-blur-sm"
          >
            <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
            RateGuard v2.0 is live. No interns were harmed.
          </motion.div>

          <h1
            ref={headlineRef}
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 overflow-hidden pb-4" // Added overflow-hidden and padding to prevent clipping during animation
          >
            <span className="block overflow-hidden">
              {"Guard Your API Limits".split("").map((char, i) => (
                <span
                  key={i}
                  className="char inline-block origin-bottom-left"
                  style={{ opacity: 0 }} // Initial state hidden
                >
                  {char === " " ? "\u00A0" : char}
                </span>
              ))}
            </span>
            <span className="block overflow-hidden text-primary">
              {"Like It’s 5pm Friday.".split("").map((char, i) => (
                <span
                  key={`line2-${i}`}
                  className="char inline-block origin-bottom-left"
                  style={{ opacity: 0 }} // Initial state hidden
                >
                  {char === " " ? "\u00A0" : char}
                </span>
              ))}
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8"
          >
            The API rate limiter that actually lets you sleep. Transparent proxy, 
            blazingly fast limits, and encrypted keys. Built for 2026, available today.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 items-center"
          >
            {isAuthenticated ? (
              <Button 
                size="lg" 
                className="h-12 px-8 text-lg group"
                onClick={() => router.push("/dashboard")}
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            ) : (
              <Link href="/signup">
                <Button 
                  size="lg" 
                  className="h-12 px-8 text-lg group"
                  onClick={handleConfetti}
                  onMouseEnter={() => setShowEasterEgg(true)}
                  onMouseLeave={() => setShowEasterEgg(false)}
                >
                  Start Managing Limits
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            )}
            <Link href="/docs">
              <Button variant="outline" size="lg" className="h-12 px-8 text-lg">
                View Documentation
              </Button>
            </Link>
          </motion.div>

          {showEasterEgg && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-full mt-4 p-2 bg-card rounded-lg shadow-xl border text-xs text-muted-foreground"
            >
              "You miss 100% of the shots you don't take. - Wayne Gretzky" - Michael Scott
            </motion.div>
          )}

          <motion.div
            style={{ y }}
            className="mt-16 relative w-full max-w-5xl aspect-[16/9] rounded-xl border bg-background/50 backdrop-blur-sm shadow-2xl overflow-hidden hidden md:block"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
            <div className="p-8 grid grid-cols-3 gap-8 h-full items-center">
              <div className="space-y-4 text-left">
                <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  Incoming: 10k req/s
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-red-500"
                    animate={{ width: ["0%", "100%"] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
              </div>
              
              <div className="flex justify-center">
                <div className="w-32 h-32 rounded-full border-4 border-primary flex items-center justify-center bg-background relative z-10">
                  <Shield className="w-12 h-12 text-primary" />
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  Allowed: 5k req/s
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-green-500"
                    animate={{ width: ["0%", "50%"] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
