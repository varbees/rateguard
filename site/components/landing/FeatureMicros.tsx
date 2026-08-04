"use client";

import { motion } from "framer-motion";

// A live gauge sweeping — the dashboard watching a running instance.
export function MicroDashboard() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M8 24a10 10 0 0 1 20 0" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
      <motion.path
        d="M8 24a10 10 0 0 1 20 0"
        stroke="var(--muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="31.4"
        animate={{ strokeDashoffset: [31.4, 8, 20] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <circle cx="18" cy="24" r="1.6" fill="var(--fg)" />
    </svg>
  );
}
