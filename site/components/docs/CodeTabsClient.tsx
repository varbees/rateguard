"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./CopyButton";

export type HighlightedTab = { label: string; code: string; html: string };

const STORAGE_KEY = "rateguard-docs-lang";

/**
 * Interactive shell for a language-tabbed code block. The code is highlighted at
 * build time (server) and handed in as `html`; this component only switches tabs
 * and persists the choice across every CodeTabs on the site (localStorage), so a
 * Python reader stays on Python — same behaviour as Anthropic/Stripe docs.
 */
export function CodeTabsClient({ tabs }: { tabs: HighlightedTab[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const i = tabs.findIndex((t) => t.label === saved);
    if (i >= 0) setActive(i);
  }, [tabs]);

  const pick = (i: number) => {
    setActive(i);
    try {
      localStorage.setItem(STORAGE_KEY, tabs[i].label);
    } catch {
      /* private mode */
    }
  };

  const tab = tabs[Math.min(active, tabs.length - 1)];

  return (
    <div className="my-5 overflow-hidden rounded-lg border border-[#262626] bg-[#111]">
      <div className="flex items-center justify-between border-b border-[#262626] pr-3">
        <div className="flex" role="tablist" aria-label="Language">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={i === active}
              onClick={() => pick(i)}
              className={`border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                i === active
                  ? "border-[#f59e0b] text-[#f5f5f5]"
                  : "border-transparent text-[#737373] hover:text-[#a3a3a3]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} />
      </div>
      <div
        className="shiki-block overflow-x-auto p-4 text-[13px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: tab.html }}
      />
    </div>
  );
}
