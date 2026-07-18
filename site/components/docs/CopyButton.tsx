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
      className="rounded-md border border-[#333] px-2 py-1 text-[11px] font-medium text-[#a3a3a3] transition-colors hover:border-[#525252] hover:text-[#f5f5f5]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
