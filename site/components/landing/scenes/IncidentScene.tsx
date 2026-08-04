"use client";

import { useEffect, useRef } from "react";
import { useSceneProgress } from "../scroll/PinnedScene";
import { clamp01, easeOutCubic } from "./motion-utils";

// Real, sourced figures — see /denial-of-wallet. Never invent a number here.
const INCIDENTS = [
  { amount: 6531, window: "under 24 hours", context: "One unsupervised agent, scanning a hobbyist network." },
  { amount: 47000, window: "11 days (reported)", context: "Two agents, passing work back and forth." },
];

function segmentFor(p: number) {
  if (p < 0.5) {
    return { incident: INCIDENTS[0], local: clamp01((p - 0.05) / 0.4) };
  }
  return { incident: INCIDENTS[1], local: clamp01((p - 0.55) / 0.4) };
}

export default function IncidentScene() {
  const progress = useSceneProgress();
  const amountRef = useRef<HTMLSpanElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const update = (p: number) => {
      const { incident, local } = segmentFor(p);
      const eased = easeOutCubic(local);
      const value = Math.round(incident.amount * eased);
      if (amountRef.current) amountRef.current.textContent = value.toLocaleString("en-US");
      if (contextRef.current) {
        contextRef.current.textContent =
          local > 0.02 ? `${incident.context} ${incident.window}` : incident.context;
      }
      if (pathRef.current) pathRef.current.style.strokeDashoffset = String(1 - eased);
    };
    update(progress.get());
    return progress.on("change", update);
  }, [progress]);

  return (
    <div className="w-full max-w-lg text-center">
      <div className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        denial of wallet, in progress
      </div>
      <div className="font-mono text-6xl font-medium tabular-nums text-[var(--fg)] sm:text-7xl">
        $<span ref={amountRef}>0</span>
      </div>
      <div ref={contextRef} className="mt-3 min-h-[1.5em] text-sm text-[var(--muted)]" />
      <svg viewBox="0 0 320 80" className="mx-auto mt-6 w-full max-w-sm" fill="none">
        <path d="M4 70 C 80 66, 140 50, 200 34 S 300 8, 316 4" stroke="var(--border)" strokeWidth="1.5" />
        <path
          ref={pathRef}
          d="M4 70 C 80 66, 140 50, 200 34 S 300 8, 316 4"
          stroke="#b91c1c"
          strokeWidth="1.5"
          strokeLinecap="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
        />
      </svg>
    </div>
  );
}
