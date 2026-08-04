"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { MotionValue } from "framer-motion";
import { clamp01, easeOutCubic, smoothstep } from "./motion-utils";

function useSceneUpdate(progress: MotionValue<number>, update: (p: number) => void) {
  useEffect(() => {
    update(progress.get());
    return progress.on("change", update);
  }, [progress, update]);
}

function Caption({ innerRef }: { innerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={innerRef}
      className="min-h-[1.4em] text-center font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted)]"
    />
  );
}

// ── Act 3.1 — Ask before you call ───────────────────────────────────────
export function HandshakeScene({ progress }: { progress: MotionValue<number> }) {
  const requestRef = useRef<SVGPathElement>(null);
  const responseRef = useRef<SVGPathElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useSceneUpdate(progress, (p) => {
    if (requestRef.current) requestRef.current.style.strokeDashoffset = String(1 - easeOutCubic(clamp01((p - 0.05) / 0.3)));
    if (responseRef.current) responseRef.current.style.strokeDashoffset = String(1 - easeOutCubic(clamp01((p - 0.4) / 0.32)));
    if (checkRef.current) checkRef.current.style.opacity = String(smoothstep(0.72, 0.88, p));
    if (captionRef.current) {
      captionRef.current.textContent =
        p < 0.35 ? "agent asks: can I make this call?" : p < 0.72 ? "guard answers before any request is sent" : "peek semantics — nothing consumed yet";
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <svg viewBox="0 0 340 140" className="w-full" fill="none">
        <circle cx="40" cy="70" r="9" fill="var(--fg)" />
        <circle cx="300" cy="70" r="9" fill="var(--muted)" />
        <text x="40" y="100" textAnchor="middle" className="fill-[var(--muted)]" fontSize="10" fontFamily="var(--font-mono)">agent</text>
        <text x="300" y="100" textAnchor="middle" className="fill-[var(--muted)]" fontSize="10" fontFamily="var(--font-mono)">guard</text>
        <path ref={requestRef} d="M52 66 L288 66" stroke="var(--fg)" strokeWidth="1.5" strokeDasharray="1" style={{ strokeDashoffset: 1 }} />
        <path ref={responseRef} d="M288 74 L52 74" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="1" style={{ strokeDashoffset: 1 }} />
        <path ref={checkRef} d="M32 50 L37 56 L48 42" stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ opacity: 0 }} />
      </svg>
      <Caption innerRef={captionRef} />
    </div>
  );
}

// ── Act 3.2 — Real spend, not estimates ─────────────────────────────────
export function MeterScene({ progress }: { progress: MotionValue<number> }) {
  const pathRef = useRef<SVGPathElement>(null);
  const costRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useSceneUpdate(progress, (p) => {
    const local = clamp01((p - 0.05) / 0.8);
    const eased = easeOutCubic(local);
    if (pathRef.current) pathRef.current.style.strokeDashoffset = String(1 - eased);
    if (costRef.current) costRef.current.textContent = (0.0842 * eased).toFixed(4);
    if (captionRef.current) {
      captionRef.current.textContent = local < 0.98
        ? "metering usage as the response streams back"
        : "real token usage, not a static estimate";
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="font-mono text-3xl tabular-nums text-[var(--fg)]">
        $<span ref={costRef}>0.0000</span>
      </div>
      <svg viewBox="0 0 340 140" className="w-full" fill="none">
        <path d="M10 120 L60 100 L100 70 L140 110 L180 50 L220 80 L260 30 L300 60 L330 15" stroke="var(--border)" strokeWidth="1.5" />
        <path
          ref={pathRef}
          d="M10 120 L60 100 L100 70 L140 110 L180 50 L220 80 L260 30 L300 60 L330 15"
          stroke="var(--fg)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
        />
      </svg>
      <Caption innerRef={captionRef} />
    </div>
  );
}

// ── Act 3.3 — Loops get caught, not billed ──────────────────────────────
export function LoopScene({ progress }: { progress: MotionValue<number> }) {
  const dot1Ref = useRef<SVGCircleElement>(null);
  const dot2Ref = useRef<SVGCircleElement>(null);
  const chipRef = useRef<SVGGElement>(null);
  const haltRef = useRef<SVGCircleElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useSceneUpdate(progress, (p) => {
    const amplitude = 1 - smoothstep(0.45, 0.58, p);
    const angle = p * Math.PI * 6;
    const cx = 170, cy = 70;
    if (dot1Ref.current) {
      dot1Ref.current.setAttribute("cx", String(cx + Math.cos(angle) * 40 * amplitude));
      dot1Ref.current.setAttribute("cy", String(cy + Math.sin(angle) * 22 * amplitude));
    }
    if (dot2Ref.current) {
      dot2Ref.current.setAttribute("cx", String(cx + Math.cos(angle + Math.PI) * 40 * amplitude));
      dot2Ref.current.setAttribute("cy", String(cy + Math.sin(angle + Math.PI) * 22 * amplitude));
    }
    if (chipRef.current) chipRef.current.style.opacity = String(smoothstep(0.5, 0.62, p));
    if (haltRef.current) haltRef.current.style.opacity = String(smoothstep(0.7, 0.85, p));
    if (captionRef.current) {
      captionRef.current.textContent = p < 0.5
        ? "same request, repeated"
        : p < 0.7
        ? "fingerprinted — SHA-256 over prompt + tools"
        : "halted before it burns the budget";
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <svg viewBox="0 0 340 140" className="w-full" fill="none">
        <circle ref={dot1Ref} cx="210" cy="70" r="5" fill="var(--fg)" />
        <circle ref={dot2Ref} cx="130" cy="70" r="5" fill="var(--muted)" />
        <g ref={chipRef} style={{ opacity: 0 }}>
          <rect x="132" y="58" width="76" height="24" rx="12" fill="var(--card)" stroke="var(--fg)" strokeWidth="1.5" />
          <text x="170" y="74" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" className="fill-[var(--fg)]">SHA-256</text>
        </g>
        <circle ref={haltRef} cx="170" cy="70" r="26" fill="none" stroke="#b91c1c" strokeWidth="1.5" style={{ opacity: 0 }} />
      </svg>
      <Caption innerRef={captionRef} />
    </div>
  );
}

// ── Act 3.4 — One algorithm, three runtimes ─────────────────────────────
const TRACKS = [
  { label: "Go", y: 30 },
  { label: "Node.js", y: 70 },
  { label: "Python", y: 110 },
];

export function ParityScene({ progress }: { progress: MotionValue<number> }) {
  const trackRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const captionRef = useRef<HTMLDivElement>(null);

  useSceneUpdate(progress, (p) => {
    const drawT = easeOutCubic(clamp01(p / 0.3));
    const x = 20 + clamp01(p) * 300;
    const wobble = Math.sin(p * Math.PI * 4) * 10;
    TRACKS.forEach((track, i) => {
      const line = trackRefs.current[i];
      if (line) line.style.strokeDashoffset = String(1 - drawT);
      const dot = dotRefs.current[i];
      if (dot) {
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(track.y + wobble));
      }
    });
    if (captionRef.current) {
      captionRef.current.textContent = "same token bucket math, replayed lockstep by shared conformance tests";
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <svg viewBox="0 0 340 140" className="w-full" fill="none">
        {TRACKS.map((track, i) => (
          <g key={track.label}>
            <text x="10" y={track.y - 12} fontSize="9" fontFamily="var(--font-mono)" className="fill-[var(--muted)]">{track.label}</text>
            <path
              ref={(el) => { trackRefs.current[i] = el; }}
              d={`M20 ${track.y} L320 ${track.y}`}
              stroke="var(--border)"
              strokeWidth="1.5"
              pathLength={1}
              style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
            />
            <circle ref={(el) => { dotRefs.current[i] = el; }} cx="20" cy={track.y} r="4" fill="var(--fg)" />
          </g>
        ))}
      </svg>
      <Caption innerRef={captionRef} />
    </div>
  );
}

// ── Act 3.5 — Nothing else to run ───────────────────────────────────────
export function SingleNodeScene({ progress }: { progress: MotionValue<number> }) {
  const ghostRef = useRef<SVGGElement>(null);
  const crossRef = useRef<SVGGElement>(null);
  const soloRef = useRef<SVGGElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useSceneUpdate(progress, (p) => {
    if (ghostRef.current) ghostRef.current.style.opacity = String(0.55 - smoothstep(0.3, 0.6, p) * 0.4);
    if (crossRef.current) crossRef.current.style.opacity = String(smoothstep(0.3, 0.5, p));
    if (soloRef.current) soloRef.current.style.opacity = String(smoothstep(0.15, 0.5, p));
    if (captionRef.current) {
      captionRef.current.textContent = p < 0.4 ? "with a gateway: a network hop, every call" : "in your process: no hop, tens of microseconds";
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <svg viewBox="0 0 340 160" className="w-full" fill="none">
        <g ref={ghostRef} style={{ opacity: 0.55 }}>
          <rect x="10" y="18" width="50" height="26" rx="4" stroke="var(--muted)" strokeWidth="1.5" fill="none" />
          <rect x="145" y="18" width="50" height="26" rx="4" stroke="var(--muted)" strokeWidth="1.5" fill="none" />
          <rect x="280" y="18" width="50" height="26" rx="4" stroke="var(--muted)" strokeWidth="1.5" fill="none" />
          <line x1="60" y1="31" x2="145" y2="31" stroke="var(--muted)" strokeWidth="1.5" />
          <line x1="195" y1="31" x2="280" y2="31" stroke="var(--muted)" strokeWidth="1.5" />
          <text x="170" y="14" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" className="fill-[var(--muted)]">gateway</text>
          <g ref={crossRef} style={{ opacity: 0 }}>
            <line x1="148" y1="21" x2="192" y2="41" stroke="#b91c1c" strokeWidth="2" />
            <line x1="192" y1="21" x2="148" y2="41" stroke="#b91c1c" strokeWidth="2" />
          </g>
        </g>
        <g ref={soloRef} style={{ opacity: 0 }}>
          <rect x="90" y="90" width="160" height="56" rx="6" stroke="var(--fg)" strokeWidth="1.5" fill="var(--card)" />
          <circle cx="130" cy="118" r="6" fill="var(--fg)" />
          <circle cx="210" cy="118" r="6" fill="var(--muted)" />
          <line x1="140" y1="118" x2="200" y2="118" stroke="var(--fg)" strokeWidth="1.5" />
          <text x="170" y="164" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" className="fill-[var(--muted)]">your process</text>
        </g>
      </svg>
      <Caption innerRef={captionRef} />
    </div>
  );
}

// ── Act 3.7 — Stopped without a redeploy ────────────────────────────────
const ROWS = [
  { y: 45, label: "customer A", freezeAt: 0.5 },
  { y: 100, label: "customer B", freezeAt: null },
];

export function FreezeScene({ progress }: { progress: MotionValue<number> }) {
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const barRef = useRef<SVGLineElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useSceneUpdate(progress, (p) => {
    ROWS.forEach((row, i) => {
      const dot = dotRefs.current[i];
      if (!dot) return;
      const effectiveP = row.freezeAt !== null ? Math.min(p, row.freezeAt) : p;
      dot.setAttribute("cx", String(20 + effectiveP * 300));
    });
    if (barRef.current) barRef.current.style.opacity = String(smoothstep(0.46, 0.56, p));
    if (captionRef.current) {
      captionRef.current.textContent = p < 0.46
        ? "steady outbound traffic, two customers"
        : "Freeze(\"customer A\") — admin API, no redeploy";
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <svg viewBox="0 0 340 140" className="w-full" fill="none">
        {ROWS.map((row, i) => (
          <g key={row.label}>
            <text x="10" y={row.y - 12} fontSize="9" fontFamily="var(--font-mono)" className="fill-[var(--muted)]">{row.label}</text>
            <line x1="20" y1={row.y} x2="320" y2={row.y} stroke="var(--border)" strokeWidth="1.5" />
            <circle ref={(el) => { dotRefs.current[i] = el; }} cx="20" cy={row.y} r="4" fill={i === 0 ? "#b91c1c" : "var(--fg)"} />
          </g>
        ))}
        <line ref={barRef} x1="170" y1="24" x2="170" y2="60" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0 }} />
      </svg>
      <Caption innerRef={captionRef} />
    </div>
  );
}

// ── Act 3.6 — Failure reroutes, it doesn't cascade ──────────────────────
export function FallbackScene({ progress }: { progress: MotionValue<number> }) {
  const lineARef = useRef<SVGPathElement>(null);
  const lineBRef = useRef<SVGPathElement>(null);
  const providerARef = useRef<SVGCircleElement>(null);
  const providerBRef = useRef<SVGCircleElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useSceneUpdate(progress, (p) => {
    if (lineARef.current) {
      lineARef.current.style.strokeDashoffset = String(1 - easeOutCubic(clamp01(p / 0.3)));
      lineARef.current.style.opacity = String(1 - smoothstep(0.5, 0.65, p) * 0.7);
    }
    if (lineBRef.current) lineBRef.current.style.strokeDashoffset = String(1 - easeOutCubic(clamp01((p - 0.5) / 0.35)));
    if (providerARef.current) {
      const tripped = smoothstep(0.4, 0.52, p);
      providerARef.current.setAttribute("fill", tripped > 0.5 ? "#b91c1c" : "var(--fg)");
      providerARef.current.style.opacity = String(1 - tripped * 0.3);
    }
    if (providerBRef.current) providerBRef.current.style.opacity = String(smoothstep(0.55, 0.85, p));
    if (captionRef.current) {
      captionRef.current.textContent = p < 0.4 ? "provider A, healthy" : p < 0.55 ? "breaker trips — 429 / 5xx" : "rerouted automatically, no interruption";
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <svg viewBox="0 0 340 160" className="w-full" fill="none">
        <circle cx="30" cy="80" r="8" fill="var(--fg)" />
        <text x="30" y="105" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" className="fill-[var(--muted)]">app</text>
        <path ref={lineARef} d="M40 76 L160 40" stroke="var(--fg)" strokeWidth="1.5" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 }} />
        <circle ref={providerARef} cx="172" cy="36" r="8" fill="var(--fg)" />
        <text x="172" y="20" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" className="fill-[var(--muted)]">provider A</text>
        <path ref={lineBRef} d="M40 84 C 100 130, 250 130, 300 120" stroke="var(--fg)" strokeWidth="1.5" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 }} />
        <circle ref={providerBRef} cx="312" cy="120" r="8" fill="var(--fg)" style={{ opacity: 0 }} />
        <text x="300" y="140" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" className="fill-[var(--muted)]">provider B</text>
      </svg>
      <Caption innerRef={captionRef} />
    </div>
  );
}
