"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, LayoutDashboard, Activity, Globe } from "lucide-react";
import confetti from "canvas-confetti";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDashboardStore } from "@/lib/store";
import { useUser } from "@/lib/hooks/use-api";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  PerspectiveCamera,
  Environment,
  Sphere,
  MeshDistortMaterial,
  Ring,
} from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";

// --- 3D Components ---

function AggregatorCore() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <Sphere args={[1, 32, 32]} ref={meshRef}>
        <MeshDistortMaterial
          color="#3b82f6"
          envMapIntensity={0.4}
          clearcoat={0.8}
          clearcoatRoughness={0}
          metalness={0.1}
        />
      </Sphere>
      <pointLight position={[-10, -10, -10]} intensity={1} color="#3b82f6" />
      <pointLight position={[10, 10, 10]} intensity={1} color="#10b981" />
    </Float>
  );
}

function RateLimitRings() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.z = state.clock.getElapsedTime() * 0.1;
      groupRef.current.rotation.x =
        Math.sin(state.clock.getElapsedTime() * 0.2) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <Ring args={[1.4, 1.45, 64]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          color="#10b981"
          side={THREE.DoubleSide}
          transparent
          opacity={0.6}
        />
      </Ring>
      <Ring args={[1.8, 1.85, 64]} rotation={[Math.PI / 1.8, 0, 0]}>
        <meshStandardMaterial
          color="#f59e0b"
          side={THREE.DoubleSide}
          transparent
          opacity={0.4}
        />
      </Ring>
      <Ring args={[2.2, 2.25, 64]} rotation={[Math.PI / 1.6, 0, 0]}>
        <meshStandardMaterial
          color="#ef4444"
          side={THREE.DoubleSide}
          transparent
          opacity={0.2}
        />
      </Ring>
    </group>
  );
}

function RequestParticles() {
  const count = 30; // Reduced from 50 for better performance
  const [positions] = useState(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    return pos;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#ffffff"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

function Scene() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 6]} />
      <Environment preset="city" />
      <ambientLight intensity={0.5} />

      <AggregatorCore />
      <RateLimitRings />
      <RequestParticles />
    </>
  );
}

function SceneSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/10 rounded-xl animate-pulse">
      <div className="w-32 h-32 rounded-full bg-muted/20" />
    </div>
  );
}

// --- Main Component ---

export function Hero() {
  const router = useRouter();
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 100]);

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

    gsap.killTweensOf(chars);

    gsap.fromTo(
      chars,
      { opacity: 0, y: 50, rotateX: -90 },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        stagger: 0.02,
        duration: 0.8,
        ease: "back.out(1.7)",
        delay: 0.2,
      }
    );
  }, []);

  const handleConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#3b82f6", "#10b981", "#f59e0b"],
    });
  };

  return (
    <section
      ref={containerRef}
      className="relative h-full flex flex-col items-center justify-center overflow-hidden px-4"
    >
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

      <div className="container max-w-7xl mx-auto relative z-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text Content - Left aligned */}
          <div className="flex flex-col items-start text-left space-y-6 order-2 lg:order-1">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium bg-background/50 backdrop-blur-sm shadow-sm"
            >
              <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
              Concurrent Aggregator v2.0
            </motion.div>

            <h1
              ref={headlineRef}
              className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter leading-tight"
            >
              <span className="block overflow-hidden">
                {"Global Traffic.".split("").map((char, i) => (
                  <span
                    key={i}
                    className="char inline-block origin-bottom"
                    style={{ opacity: 0 }}
                  >
                    {char === " " ? "\u00A0" : char}
                  </span>
                ))}
              </span>
              <span className="block overflow-hidden text-primary">
                {"Locally Tamed.".split("").map((char, i) => (
                  <span
                    key={`line2-${i}`}
                    className="char inline-block origin-bottom"
                    style={{ opacity: 0 }}
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
              The distributed rate limiter that thinks globally and acts
              locally. Protect your backend with sub-millisecond latency,
              intelligent LLM token tracking, and enterprise-grade concurrency
              control. Real-time cost monitoring included.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 items-start w-full sm:w-auto"
            >
              {isAuthenticated ? (
                <Button
                  size="lg"
                  className="h-12 px-8 text-lg group w-full sm:w-auto"
                  onClick={() => router.push("/dashboard")}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              ) : (
                <Link href="/signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="h-12 px-8 text-lg group w-full"
                    onClick={handleConfetti}
                    onMouseEnter={() => setShowEasterEgg(true)}
                    onMouseLeave={() => setShowEasterEgg(false)}
                  >
                    Start Guarding
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              )}
              <Link href="/docs" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 px-8 text-lg w-full"
                >
                  Documentation
                </Button>
              </Link>
            </motion.div>

            {showEasterEgg && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute top-full mt-4 p-2 bg-card rounded-lg shadow-xl border text-xs text-muted-foreground"
              >
                &quot;I declare... RATE LIMITING!&quot; - Michael Scott
                (probably)
              </motion.div>
            )}
          </div>

          {/* 3D Visual - Fixed dimensions to prevent CLS */}
          <motion.div
            style={{ y }}
            className="relative h-[500px] w-full order-1 lg:order-2"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl opacity-30" />
            {/* Preload with skeleton to prevent layout shift */}
            <Suspense fallback={<SceneSkeleton />}>
              <Canvas className="w-full h-full">
                <Scene />
              </Canvas>
            </Suspense>

            {/* Floating Stats Cards */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="absolute top-10 right-0 md:right-10 bg-card/80 backdrop-blur-md border p-4 rounded-xl shadow-lg max-w-[200px] hidden md:block"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Activity className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Latency</div>
                  <div className="font-bold font-mono">1.2ms</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="absolute bottom-20 left-0 md:left-10 bg-card/80 backdrop-blur-md border p-4 rounded-xl shadow-lg max-w-[200px] hidden md:block"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Globe className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Global Nodes
                  </div>
                  <div className="font-bold font-mono">24/24 Active</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
