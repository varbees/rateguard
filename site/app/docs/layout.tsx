import type { Metadata } from "next";
import Link from "next/link";
import { docHref, docsNav } from "../../lib/docs-nav";
import { DocsNavLinks } from "../../components/docs/DocsNavLinks";

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
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#737373]">
            {section.label}
          </p>
          <DocsNavLinks
            links={section.pages.map((p) => ({ href: docHref(p.slug), title: p.title }))}
          />
        </div>
      ))}
      <div className="border-t border-[#262626] pt-5">
        <a
          href="https://github.com/varbees/rateguard"
          className="block text-[13px] text-[#737373] transition-colors hover:text-[#f5f5f5]"
        >
          GitHub ↗
        </a>
        <a
          href="/llms.txt"
          className="mt-2 block text-[13px] text-[#737373] transition-colors hover:text-[#f5f5f5]"
        >
          llms.txt — docs for AI readers
        </a>
      </div>
    </nav>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-[#262626] bg-[#0a0a0a]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="text-[15px] font-bold tracking-tight">
              RateGuard<span className="text-[#f59e0b]">.</span>
            </Link>
            <Link href="/docs" className="text-sm font-medium text-[#f5f5f5] hover:text-white transition-colors">
              Docs
            </Link>
          </div>
          <a
            href="https://github.com/varbees/rateguard"
            className="text-sm text-[#737373] transition-colors hover:text-[#f5f5f5]"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
          <Sidebar />
        </aside>

        <div className="min-w-0 flex-1 py-10">
          {/* Mobile nav */}
          <details className="mb-8 rounded-lg border border-[#262626] lg:hidden">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[#a3a3a3]">
              Docs menu
            </summary>
            <div className="border-t border-[#262626] p-4">
              <Sidebar />
            </div>
          </details>

          <main className="max-w-3xl pb-24">{children}</main>
        </div>
      </div>
    </div>
  );
}
