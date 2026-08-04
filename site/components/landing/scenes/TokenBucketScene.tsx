"use client";

import { useEffect, useRef } from "react";
import { useSceneProgress } from "../scroll/PinnedScene";
import { bump, clamp01, easeOutCubic } from "./motion-utils";

const BURST = 12;

function tokenLevel(p: number) {
  if (p < 0.15) return BURST;
  if (p < 0.55) return BURST - (BURST - 0.4) * easeOutCubic(clamp01((p - 0.15) / 0.4));
  if (p < 0.85) return 0.4;
  return 0.4 + (11 - 0.4) * easeOutCubic(clamp01((p - 0.85) / 0.15));
}

function stageLabel(p: number) {
  if (p < 0.15) return "idle — bucket full";
  if (p < 0.55) return "draining — requests admitted";
  if (p < 0.66) return "empty — request denied";
  if (p < 0.85) return "soft-stop — request queued";
  return "refilling — queued request released";
}

const PULSES = Array.from({ length: 5 }, (_, i) => {
  const start = 0.16 + i * 0.075;
  return { start, end: start + 0.07 };
});

export default function TokenBucketScene() {
  const progress = useSceneProgress();
  const fillRef = useRef<HTMLDivElement>(null);
  const deniedRef = useRef<HTMLDivElement>(null);
  const queuedRef = useRef<HTMLDivElement>(null);
  const releasedRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const pulseRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const update = (p: number) => {
      const level = tokenLevel(p);
      if (fillRef.current) fillRef.current.style.transform = `scaleY(${level / BURST})`;
      if (countRef.current) countRef.current.textContent = level.toFixed(1);
      if (labelRef.current) labelRef.current.textContent = stageLabel(p);

      const denied = bump(p, 0.52, 0.68);
      if (deniedRef.current) deniedRef.current.style.opacity = String(denied);

      const queued = bump(p, 0.64, 0.87);
      if (queuedRef.current) queuedRef.current.style.opacity = String(queued);

      const releasedT = clamp01((p - 0.85) / 0.14);
      const releasedEased = easeOutCubic(releasedT);
      if (releasedRef.current) {
        releasedRef.current.style.opacity = String(bump(p, 0.85, 0.99));
        releasedRef.current.style.transform = `translateX(${releasedEased * 48}px)`;
      }

      PULSES.forEach((pulse, i) => {
        const el = pulseRefs.current[i];
        if (!el) return;
        const t = clamp01((p - pulse.start) / (pulse.end - pulse.start));
        el.style.opacity = String(bump(p, pulse.start, pulse.end));
        el.style.transform = `translateX(${(1 - easeOutCubic(t)) * -40}px)`;
      });
    };
    update(progress.get());
    return progress.on("change", update);
  }, [progress]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div ref={labelRef} className="min-h-[1.2em] font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted)]" />

      <div className="relative h-56 w-40">
        <div className="absolute inset-0 overflow-hidden rounded-b-3xl rounded-t-lg border border-[var(--border)] bg-[var(--card)] shadow-[0_10px_34px_-16px_rgba(0,0,0,0.25)]">
          <div
            ref={fillRef}
            className="absolute inset-x-0 bottom-0 h-full origin-bottom bg-gradient-to-t from-[var(--fg)] to-[var(--fg)]/70"
          />
          {Array.from({ length: BURST }).map((_, i) => (
            <div
              key={i}
              className="absolute inset-x-2 border-t border-[var(--muted)]/20 mix-blend-difference"
              style={{ bottom: `${(i / BURST) * 100}%` }}
            />
          ))}
        </div>

        {/* admitted requests, streaming in from the left */}
        {PULSES.map((_, i) => (
          <div
            key={i}
            ref={(el) => { pulseRefs.current[i] = el; }}
            className="absolute left-3 top-1/2 h-2 w-2 rounded-full opacity-0"
            style={{ background: "var(--fg)" }}
          />
        ))}

        {/* denied request */}
        <div ref={deniedRef} className="absolute -left-2 top-1/2 h-2 w-2 rounded-full opacity-0" style={{ background: "#b91c1c" }} />

        {/* queued request, waiting outside the vessel */}
        <div
          ref={queuedRef}
          className="absolute -right-3 top-[38%] h-2.5 w-2.5 rounded-full border border-dashed opacity-0"
          style={{ borderColor: "var(--muted)" }}
        />

        {/* queued request, released */}
        <div ref={releasedRef} className="absolute -right-3 top-[38%] h-2 w-2 rounded-full opacity-0" style={{ background: "var(--fg)" }} />
      </div>

      <div className="text-center">
        <div className="font-mono text-sm text-[var(--fg)]">
          <span ref={countRef}>12.0</span> <span className="text-[var(--muted)]">/ {BURST} tokens</span>
        </div>
        <div className="mt-1 font-mono text-xs text-[var(--muted)]">
          tokens = min(burst, tokens + Δt · rps)
        </div>
      </div>
    </div>
  );
}
