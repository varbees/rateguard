"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// A soft, unpinned drift — not a scene, just texture. Skipped entirely
// under prefers-reduced-motion.
export default function ParallaxDrift({ children, range = 24 }: { children: ReactNode; range?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [range, -range]);
  const prefersReduced = useReducedMotion();

  if (prefersReduced) return <div ref={ref}>{children}</div>;

  return (
    <div ref={ref}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}
