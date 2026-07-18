"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Heading = { id: string; text: string };

/**
 * Right-rail "On this page" nav. Scans the rendered content for h2[id]
 * after mount rather than requiring every doc page to also export a
 * headings list — the id/text already exists on every DocH2, this just
 * reads it back out of the DOM.
 */
export function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLHeadingElement>("main h2[id]"));
    setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent ?? "" })));
    setActiveId(nodes[0]?.id ?? null);
  }, [pathname]);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="On this page" className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-[var(--border)]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={activeId === h.id ? "true" : undefined}
              className={`-ml-px block border-l-2 py-0.5 pl-3 text-[13px] leading-snug transition-colors ${
                activeId === h.id
                  ? "border-[var(--fg)] font-medium text-[var(--fg)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
