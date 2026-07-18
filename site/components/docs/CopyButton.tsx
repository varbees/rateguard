"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--fg)]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
