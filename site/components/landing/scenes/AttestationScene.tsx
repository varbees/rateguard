"use client";

import { useEffect, useRef } from "react";
import { useSceneProgress } from "../scroll/PinnedScene";
import { smoothstep } from "./motion-utils";

// Delegation chain: each box is a real budget scope, strictly inside its
// parent — that's the actual guarantee (narrows, never widens), not a
// metaphor. Ed25519 marks are the real signing primitive the SDKs ship.
const LINKS = [
  { x: 20, w: 300, label: "agent — full budget", reveal: [0.03, 0.22] },
  { x: 65, w: 210, label: "sub-agent — delegated scope", reveal: [0.28, 0.48] },
  { x: 110, w: 120, label: "sub-sub-agent — narrower still", reveal: [0.54, 0.74] },
];

export default function AttestationScene() {
  const progress = useSceneProgress();
  const boxRefs = useRef<(SVGRectElement | null)[]>([]);
  const sigRefs = useRef<(SVGGElement | null)[]>([]);
  const stampRef = useRef<SVGGElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = (p: number) => {
      LINKS.forEach((link, i) => {
        const v = smoothstep(link.reveal[0], link.reveal[1], p);
        const box = boxRefs.current[i];
        if (box) {
          box.style.opacity = String(v);
          box.style.transform = `scale(${0.94 + v * 0.06})`;
        }
        const sig = sigRefs.current[i];
        if (sig) sig.style.opacity = String(smoothstep(link.reveal[1] - 0.04, link.reveal[1] + 0.06, p));
      });
      if (stampRef.current) stampRef.current.style.opacity = String(smoothstep(0.8, 0.95, p));

      if (captionRef.current) {
        captionRef.current.textContent =
          p < 0.28 ? "agent holds the budget"
          : p < 0.54 ? "delegates a sub-budget — strictly inside the parent, Ed25519-signed"
          : p < 0.8 ? "delegates again — still narrows, never widens"
          : "spend receipt — signed, offline-verifiable proof of what was actually spent";
      }
    };
    update(progress.get());
    return progress.on("change", update);
  }, [progress]);

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <svg viewBox="0 0 340 140" className="w-full" fill="none">
        {LINKS.map((link, i) => (
          <g key={link.label} style={{ transformOrigin: `${link.x + link.w / 2}px 70px` }}>
            <rect
              ref={(el) => { boxRefs.current[i] = el; }}
              x={link.x}
              y={30 + i * 0}
              width={link.w}
              height="80"
              rx="8"
              stroke="var(--fg)"
              strokeWidth="1.5"
              fill={i === LINKS.length - 1 ? "var(--card)" : "none"}
              style={{ opacity: 0, transformOrigin: `${link.x + link.w / 2}px 70px` }}
            />
            <g ref={(el) => { sigRefs.current[i] = el; }} style={{ opacity: 0 }}>
              <circle cx={link.x + link.w - 12} cy="38" r="6" fill="var(--fg)" />
              <text x={link.x + link.w - 12} y="41" textAnchor="middle" fontSize="6" fontFamily="var(--font-mono)" className="fill-[var(--bg)]">ed</text>
            </g>
          </g>
        ))}
        <g ref={stampRef} style={{ opacity: 0 }}>
          <rect x="145" y="58" width="50" height="24" rx="4" stroke="#b91c1c" strokeWidth="1.5" fill="none" transform="rotate(-6 170 70)" />
          <text x="170" y="74" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" className="fill-[#b91c1c]" transform="rotate(-6 170 70)">receipt</text>
        </g>
      </svg>
      <div ref={captionRef} className="min-h-[1.4em] text-center font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted)]" />
    </div>
  );
}
