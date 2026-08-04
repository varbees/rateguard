"use client";

import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useSceneProgress } from "../scroll/PinnedScene";
import {
  HandshakeScene,
  MeterScene,
  LoopScene,
  ParityScene,
  SingleNodeScene,
  FallbackScene,
  FreezeScene,
} from "./GuardScenes";

// The guard sequence — one continuous scroll gesture, seven beats, like a
// montage cut on a single take rather than seven separate pinned sections.
// Keeps the "one scroll, one scene" model honest without ballooning total
// page length to seven full pins. Beats 1-6 are prevention (stop it before
// it spends); beat 7 is response (stop it after it's already running) —
// the operator story v0.5.0 shipped and the old landing page never told.
const FEATURES = [
  {
    title: "Ask before you call",
    desc: "Seven MCP tools let Claude Code, Cursor, or any MCP client check its own limit, or mint a cryptographic sub-budget, before making a request. The agent asks permission instead of hitting a 429.",
    Scene: HandshakeScene,
  },
  {
    title: "Real spend, not estimates",
    desc: "The outbound wrapper rides your HTTP client and meters every OpenAI, Anthropic, or Google call as it happens: budgeted, traced, priced.",
    Scene: MeterScene,
  },
  {
    title: "Loops get caught, not billed",
    desc: "Every request is fingerprinted with SHA-256 over a bounded LRU cache. A runaway agent repeating itself gets halted before it burns through your budget.",
    Scene: LoopScene,
  },
  {
    title: "One algorithm, three runtimes",
    desc: "Go, Node.js, and Python share the same token bucket math and the same presets. 696 tests, including shared conformance suites that replay identical admission sequences across all three, hold them to real behavioral parity — and a live matrix runs the same suite against real provider APIs, because a passing suite only proves self-consistency.",
    Scene: ParityScene,
  },
  {
    title: "Nothing else to run",
    desc: "No proxy, no sidecar, no extra service to keep alive. RateGuard runs inside your process: drop in the middleware and every call is enforced — tens of microseconds, not a network hop.",
    Scene: SingleNodeScene,
  },
  {
    title: "Failure reroutes, it doesn't cascade",
    desc: "Circuit breakers open on a failing provider and the chain moves to the next one automatically. Your application never sees the outage.",
    Scene: FallbackScene,
  },
  {
    title: "Stopped without a redeploy",
    desc: "Freeze everything, or just one customer, from the admin API: no rollout, no restart. Every block it makes lands in an enforcement audit trail — who, what, when — for the moment someone asks what happened.",
    Scene: FreezeScene,
  },
];

const N = FEATURES.length; // 7

export default function GuardMontage() {
  const progress = useSceneProgress();
  const prefersReduced = useReducedMotion();
  const settled = useMotionValue(1);

  // local 0→1 progress within each of the N equal segments — N is fixed at
  // module scope, stable across renders, safe to unroll explicitly.
  const local0 = useTransform(progress, [0 / N, 1 / N], [0, 1], { clamp: true });
  const local1 = useTransform(progress, [1 / N, 2 / N], [0, 1], { clamp: true });
  const local2 = useTransform(progress, [2 / N, 3 / N], [0, 1], { clamp: true });
  const local3 = useTransform(progress, [3 / N, 4 / N], [0, 1], { clamp: true });
  const local4 = useTransform(progress, [4 / N, 5 / N], [0, 1], { clamp: true });
  const local5 = useTransform(progress, [5 / N, 6 / N], [0, 1], { clamp: true });
  const local6 = useTransform(progress, [6 / N, 7 / N], [0, 1], { clamp: true });
  const locals = [local0, local1, local2, local3, local4, local5, local6];

  // trapezoid crossfade at segment boundaries, flat 1 at the outer page edges
  const opacity0 = useTransform(progress, [0.1129, 0.1729], [1, 0], { clamp: true });
  const opacity1 = useTransform(progress, [0.1129, 0.1729, 0.2557, 0.3157], [0, 1, 1, 0], { clamp: true });
  const opacity2 = useTransform(progress, [0.2557, 0.3157, 0.3986, 0.4586], [0, 1, 1, 0], { clamp: true });
  const opacity3 = useTransform(progress, [0.3986, 0.4586, 0.5414, 0.6014], [0, 1, 1, 0], { clamp: true });
  const opacity4 = useTransform(progress, [0.5414, 0.6014, 0.6843, 0.7443], [0, 1, 1, 0], { clamp: true });
  const opacity5 = useTransform(progress, [0.6843, 0.7443, 0.8271, 0.8871], [0, 1, 1, 0], { clamp: true });
  const opacity6 = useTransform(progress, [0.8271, 0.8871], [0, 1], { clamp: true });
  const opacities = [opacity0, opacity1, opacity2, opacity3, opacity4, opacity5, opacity6];

  // wayfinding dots: dim (0.25) when off, full when their segment is active
  const dot0 = useTransform(opacity0, (v) => 0.25 + v * 0.75);
  const dot1 = useTransform(opacity1, (v) => 0.25 + v * 0.75);
  const dot2 = useTransform(opacity2, (v) => 0.25 + v * 0.75);
  const dot3 = useTransform(opacity3, (v) => 0.25 + v * 0.75);
  const dot4 = useTransform(opacity4, (v) => 0.25 + v * 0.75);
  const dot5 = useTransform(opacity5, (v) => 0.25 + v * 0.75);
  const dot6 = useTransform(opacity6, (v) => 0.25 + v * 0.75);
  const dots = [dot0, dot1, dot2, dot3, dot4, dot5, dot6];

  // The crossfade carousel below only ever shows one feature at a time by
  // design — that's fine when scroll drives which one, but PinnedScene's
  // reduced-motion fallback freezes progress at 1, which would leave 6 of
  // 7 features permanently at opacity 0. Render all seven as a plain
  // stacked list instead: same information, no motion.
  if (prefersReduced) {
    return (
      <div className="flex w-full max-w-xl flex-col gap-14">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex flex-col items-center gap-5 text-center">
            <div>
              <h3 className="font-display text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-[var(--muted)]">{feature.desc}</p>
            </div>
            <feature.Scene progress={settled} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative h-[440px] w-full max-w-xl sm:h-[380px]">
      {FEATURES.map((feature, i) => (
        <motion.div
          key={feature.title}
          className="absolute inset-0 flex flex-col items-center gap-5 text-center"
          style={{ opacity: opacities[i], willChange: "opacity" }}
        >
          <div>
            <h3 className="font-display text-xl font-semibold mb-2">{feature.title}</h3>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-[var(--muted)]">{feature.desc}</p>
          </div>
          <feature.Scene progress={locals[i]} />
        </motion.div>
      ))}

      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-2">
        {dots.map((d, i) => (
          <motion.div
            key={FEATURES[i].title}
            className="h-1.5 w-1.5 rounded-full bg-[var(--fg)]"
            style={{ opacity: d }}
          />
        ))}
      </div>
    </div>
  );
}
