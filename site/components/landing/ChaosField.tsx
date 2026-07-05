"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const COLORS = ["var(--violet)", "#c084fc", "var(--ice)"];

type Dot = { id: number; x: number; y: number; size: number; color: string; duration: number; delay: number };

export default function ChaosField({ count = 36 }: { count?: number }) {
  // Positions are randomized client-side only, after mount — computing them
  // during SSR would produce different values than the client render and
  // trigger a hydration mismatch.
  const [dots, setDots] = useState<Dot[]>([]);

  useEffect(() => {
    setDots(
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 4,
        color: COLORS[i % COLORS.length],
        duration: 3 + Math.random() * 4,
        delay: Math.random() * 2,
      }))
    );
  }, [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            background: d.color,
            boxShadow: `0 0 ${d.size * 2}px ${d.color}`,
          }}
          animate={{
            x: [0, (Math.random() - 0.5) * 80, 0],
            y: [0, (Math.random() - 0.5) * 80, 0],
            opacity: [0.2, 0.8, 0.2],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
