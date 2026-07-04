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

export function CodeBlock({
  code,
  title,
}: {
  code: string;
  title?: string;
}) {
  return (
    <div className="group my-5 overflow-hidden rounded-lg border border-[#262626] bg-[#111]">
      <div className="flex items-center justify-between border-b border-[#262626] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-[#737373]">
          {title ?? "code"}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-[#e5e5e5]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
