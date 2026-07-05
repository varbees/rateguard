"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";

export default function StatCounter({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const count = useMotionValue(0);
  const spring = useSpring(count, { stiffness: 90, damping: 25 });
  const display = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (inView) count.set(value);
  }, [inView, value, count]);

  useEffect(() => {
    return spring.on("change", (v) => {
      if (display.current) display.current.textContent = Math.round(v).toString();
    });
  }, [spring]);

  return (
    <motion.div ref={ref} className="text-center">
      <div className="font-display text-2xl font-bold">
        <span ref={display}>0</span>
      </div>
      <div className="mt-1 text-sm text-[var(--muted)]">{label}</div>
    </motion.div>
  );
}
