"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { ReactNode } from "react";

export default function FeatureCard({
  title,
  desc,
  micro,
}: {
  title: string;
  desc: string;
  micro: ReactNode;
}) {
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [8, -8]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-8, 8]), { stiffness: 200, damping: 20 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={reset}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center">{micro}</div>
      <h3 className="font-display font-semibold mb-2">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--muted)]">{desc}</p>
    </motion.div>
  );
}
