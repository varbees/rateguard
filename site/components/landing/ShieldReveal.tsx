"use client";

import { useRef } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";

export default function ShieldReveal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const rotateY = useTransform(scrollYProgress, [0.15, 0.55], [65, 0]);
  const rotateX = useTransform(scrollYProgress, [0.15, 0.55], [-20, 0]);
  const scale = useTransform(scrollYProgress, [0.15, 0.55], [0.72, 1]);
  const opacity = useTransform(scrollYProgress, [0.1, 0.4], [0, 1]);
  const blur = useTransform(scrollYProgress, [0.15, 0.55], [10, 0]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);

  // pointer-driven tilt, layered on top of the scroll-driven rotation
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const tiltX = useSpring(py, { stiffness: 150, damping: 20 });
  const tiltY = useSpring(px, { stiffness: 150, damping: 20 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - rect.left) / rect.width - 0.5) * 16);
    py.set(((e.clientY - rect.top) / rect.height - 0.5) * -16);
  };
  const handleLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div ref={containerRef} className="relative h-[220vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        <motion.div
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          style={{ perspective: 1200 }}
          className="relative w-full max-w-3xl px-6"
        >
          <motion.img
            src="/hero.webp"
            alt="Chaotic agent traffic passing through RateGuard's shield and emerging as a metered, ordered stream"
            style={{
              rotateY,
              rotateX: useTransform([rotateX, tiltX], ([a, b]: number[]) => a + b),
              scale,
              opacity,
              filter,
              transformStyle: "preserve-3d",
            }}
            className="w-full rounded-2xl"
          />
          <motion.div
            style={{ opacity, rotateY: tiltY }}
            className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_0_120px_-20px_var(--ice)]"
          />
        </motion.div>
      </div>
    </div>
  );
}
