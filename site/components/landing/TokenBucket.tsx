"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BURST = 12;
const RPS = 2.2;

type Pulse = { id: number; allowed: boolean };

export default function TokenBucket() {
  const [tokens, setTokens] = useState(BURST);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const lastRef = useRef(performance.now());
  const pulseId = useRef(0);
  const nextCallRef = useRef(0);

  useEffect(() => {
    let raf: number;
    const tick = (now: number) => {
      const elapsed = (now - lastRef.current) / 1000;
      lastRef.current = now;

      setTokens((t) => Math.min(BURST, t + elapsed * RPS));

      if (now >= nextCallRef.current) {
        // agents call in irregular bursts, not a metronome
        const burstLikely = Math.random() < 0.35;
        nextCallRef.current = now + (burstLikely ? 60 + Math.random() * 80 : 300 + Math.random() * 500);

        setTokens((t) => {
          const allowed = t >= 1;
          const id = pulseId.current++;
          setPulses((p) => [...p.slice(-7), { id, allowed }]);
          window.setTimeout(() => setPulses((p) => p.filter((x) => x.id !== id)), 900);
          return allowed ? t - 1 : t;
        });
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fillPct = (tokens / BURST) * 100;

  return (
    <div className="relative flex flex-col items-center gap-5">
      <div className="relative h-56 w-40">
        {/* glass vessel */}
        <div className="absolute inset-0 overflow-hidden rounded-b-3xl rounded-t-lg border border-[var(--ice)]/40 bg-[var(--ink)] shadow-[0_0_40px_-12px_var(--ice)]">
          <motion.div
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--amber)] to-[var(--amber)]/40"
            animate={{ height: `${fillPct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
          {/* token rungs */}
          {Array.from({ length: BURST }).map((_, i) => (
            <div
              key={i}
              className="absolute inset-x-2 border-t border-[var(--void)]/40"
              style={{ bottom: `${(i / BURST) * 100}%` }}
            />
          ))}
        </div>

        {/* incoming pulses */}
        <AnimatePresence>
          {pulses.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: -90, y: 20 + Math.random() * 40, opacity: 0, scale: 0.6 }}
              animate={{ x: p.allowed ? 8 : -30, opacity: [0, 1, p.allowed ? 0 : 1], scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
              style={{
                background: p.allowed ? "var(--ice)" : "var(--violet)",
                boxShadow: `0 0 10px ${p.allowed ? "var(--ice)" : "var(--violet)"}`,
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="text-center">
        <div className="font-mono text-sm text-[var(--fg)]">
          {tokens.toFixed(1)} <span className="text-[var(--muted)]">/ {BURST} tokens</span>
        </div>
        <div className="mt-1 font-mono text-xs text-[var(--muted)]">
          tokens = min(burst, tokens + Δt · rps)
        </div>
      </div>
    </div>
  );
}
