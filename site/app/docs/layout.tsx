import type { Metadata } from "next";
import Link from "next/link";
import { docHref, docsNav } from "../../lib/docs-nav";
import { DocsNavLinks } from "../../components/docs/DocsNavLinks";
import { TableOfContents } from "../../components/docs/TableOfContents";

export const metadata: Metadata = {
  title: {
    default: "RateGuard Docs",
    template: "%s — RateGuard Docs",
  },
  description:
    "How to give AI agents rate-limit awareness: quickstart, MCP tools, outbound LLM spend tracking, token budgets, loop detection, and framework integrations for Go, Node.js, and Python.",
};

function Sidebar() {
  return (
    <nav aria-label="Docs" className="space-y-7">
      {docsNav.map((section) => (
        <div key={section.label}>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {section.label}
          </p>
          <DocsNavLinks
            links={section.pages.map((p) => ({ href: docHref(p.slug), title: p.title }))}
          />
        </div>
      ))}
      <div className="border-t border-[var(--border)] pt-5">
        <a
          href="https://github.com/varbees/rateguard"
          className="block text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
        >
          GitHub ↗
        </a>
        <a
          href="/llms.txt"
          className="mt-2 block text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
        >
          llms.txt — docs for AI readers
        </a>
      </div>
    </nav>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-theme min-h-screen bg-[var(--bg)] text-[var(--body)]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="font-display text-[15px] font-bold tracking-tight text-[var(--fg)]">
              RateGuard<span className="text-[var(--accent)]">.</span>
            </Link>
            <Link href="/docs" className="text-sm font-medium text-[var(--fg)] transition-colors hover:text-[var(--accent)]">
              Docs
            </Link>
          </div>
          <a
            href="https://github.com/varbees/rateguard"
            className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
          <Sidebar />
        </aside>

        <div className="min-w-0 flex-1 py-10">
          {/* Mobile nav */}
          <details className="group mb-8 rounded-lg border border-[var(--border)] lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-[var(--muted)]">
              Docs menu
              <span className="transition-transform group-open:rotate-180" aria-hidden>
                ⌄
              </span>
            </summary>
            <div className="border-t border-[var(--border)] p-4">
              <Sidebar />
            </div>
          </details>

          <main className="max-w-3xl pb-24">{children}</main>
        </div>

        {/* Right rail: on-this-page nav, desktop only */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-48 shrink-0 overflow-y-auto py-10 xl:block">
          <TableOfContents />
        </aside>
      </div>
    </div>
  );
}
