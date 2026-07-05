"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring } from "motion/react";

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 22, mass: 0.6 });

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    return spring.on("change", (v) => {
      if (spanRef.current) {
        spanRef.current.textContent = v.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }
    });
  }, [spring, decimals]);

  return <span ref={spanRef}>{value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}
