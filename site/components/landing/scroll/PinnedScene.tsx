"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useScroll, useReducedMotion, useMotionValue, type MotionValue } from "framer-motion";
import Reveal from "../Reveal";

const ProgressContext = createContext<MotionValue<number> | null>(null);

// Scenes read scroll progress via context, never as a function prop — a
// Server Component (page.tsx) can render a scene as a child element, but
// cannot pass it a closure across the RSC boundary. Keeps PinnedScene
// mountable directly from server-rendered page.tsx.
export function useSceneProgress(): MotionValue<number> {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useSceneProgress must be called within a <PinnedScene>");
  return ctx;
}

// One continuous scroll gesture drives one scene 0→1: the section pins for
// `heightVh` of scroll distance. Under prefers-reduced-motion, skips pinning
// entirely and renders the settled (progress = 1) frame through the same
// fade-on-view Reveal used site-wide — no second fallback system.
export default function PinnedScene({
  heightVh = 220,
  className,
  children,
}: {
  heightVh?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const prefersReduced = useReducedMotion();
  const settled = useMotionValue(1);

  if (prefersReduced) {
    return (
      <ProgressContext.Provider value={settled}>
        <Reveal className={className}>
          <div className="flex justify-center py-8">{children}</div>
        </Reveal>
      </ProgressContext.Provider>
    );
  }

  return (
    <ProgressContext.Provider value={scrollYProgress}>
      <div ref={ref} style={{ height: `${heightVh}dvh` }} className={`relative ${className ?? ""}`}>
        <div className="sticky top-0 flex h-dvh items-center justify-center overflow-hidden px-6">
          {children}
        </div>
      </div>
    </ProgressContext.Provider>
  );
}
