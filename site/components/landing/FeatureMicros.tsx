"use client";

import { motion } from "framer-motion";

// A pre-flight handshake: the agent asks, the guard answers, before any call is made.
export function MicroHandshake() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <motion.circle cx="9" cy="18" r="3" fill="var(--violet)" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
      <motion.circle cx="27" cy="18" r="3" fill="var(--ice)" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }} />
      <motion.line x1="12" y1="18" x2="24" y2="18" stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="2 2"
        animate={{ strokeDashoffset: [0, -8] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
    </svg>
  );
}

// A meter that only ever climbs while a call is outstanding, real spend tracking.
export function MicroMeter() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect x="4" y="6" width="28" height="24" rx="3" stroke="var(--border)" />
      <motion.path
        d="M6 26 L12 18 L18 22 L24 10 L30 14"
        stroke="var(--amber)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
    </svg>
  );
}

// A loop that repeats, then is caught and halted — the fingerprint match.
export function MicroLoop() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <motion.path
        d="M10 12 a8 8 0 1 1 0 12"
        stroke="var(--violet)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        style={{ originX: "10px", originY: "18px" }}
      />
      <motion.circle cx="10" cy="18" r="2" fill="var(--ice)"
        animate={{ scale: [1, 1.6, 1] }} transition={{ duration: 2, repeat: Infinity }} />
    </svg>
  );
}

// Three languages, one algorithm — dots pulse in lockstep, not in sequence.
export function MicroParity() {
  const colors = ["var(--ice)", "var(--amber)", "var(--violet)"];
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      {colors.map((c, i) => (
        <motion.circle
          key={c}
          cx={9 + i * 9}
          cy="18"
          r="3"
          fill={c}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </svg>
  );
}

// One process, no satellite services orbiting it.
export function MicroSingleNode() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <motion.rect x="12" y="12" width="12" height="12" rx="2" fill="var(--ink)" stroke="var(--amber)" strokeWidth="1.5"
        animate={{ boxShadow: ["none"] }} />
      <motion.rect x="12" y="12" width="12" height="12" rx="2" fill="none" stroke="var(--amber)" strokeWidth="1"
        animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ duration: 1.8, repeat: Infinity }}
        style={{ originX: "18px", originY: "18px" }} />
    </svg>
  );
}

// A live gauge sweeping — the dashboard watching a running instance.
export function MicroDashboard() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M8 24a10 10 0 0 1 20 0" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
      <motion.path
        d="M8 24a10 10 0 0 1 20 0"
        stroke="var(--ice)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="31.4"
        animate={{ strokeDashoffset: [31.4, 8, 20] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <circle cx="18" cy="24" r="1.6" fill="var(--amber)" />
    </svg>
  );
}

// A tool's traffic rerouted through a local proxy before it reaches the real endpoint.
export function MicroConnect() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect x="3" y="15" width="7" height="7" rx="1.5" stroke="var(--violet)" strokeWidth="1.5" />
      <rect x="26" y="15" width="7" height="7" rx="1.5" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="18" cy="18.5" r="4" stroke="var(--amber)" strokeWidth="1.5" />
      <motion.circle cx="18" cy="18.5" r="4" stroke="var(--amber)" strokeWidth="1"
        animate={{ scale: [1, 1.7], opacity: [0.6, 0] }} transition={{ duration: 1.8, repeat: Infinity }}
        style={{ originX: "18px", originY: "18.5px" }} />
      <path d="M10 18.5h4M22 18.5h4" stroke="var(--border)" strokeWidth="1.5" />
    </svg>
  );
}

// A chain that reroutes the instant one link opens.
export function MicroFallback() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <circle cx="7" cy="18" r="3" fill="var(--ice)" />
      <motion.circle cx="18" cy="18" r="3" fill="var(--violet)"
        animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 2.4, repeat: Infinity }} />
      <circle cx="29" cy="18" r="3" fill="var(--amber)" />
      <line x1="10" y1="18" x2="15" y2="18" stroke="var(--border)" strokeWidth="1.5" />
      <motion.path
        d="M10 18 C 16 6, 22 6, 26 16"
        stroke="var(--amber)"
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2.4, repeat: Infinity, times: [0, 1] }}
      />
    </svg>
  );
}
