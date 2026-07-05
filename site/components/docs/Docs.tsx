import Link from "next/link";
import { docHref, pagerFor } from "../../lib/docs-nav";

/** Inline callout. kind: note (amber), warn (red), tip (blue). */
export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: "note" | "warn" | "tip";
  title?: string;
  children: React.ReactNode;
}) {
  const styles = {
    note: { border: "border-[#f59e0b]/35", label: "text-[#f59e0b]", fallback: "Note" },
    warn: { border: "border-[#ef4444]/35", label: "text-[#ef4444]", fallback: "Watch out" },
    tip: { border: "border-[#3b82f6]/35", label: "text-[#3b82f6]", fallback: "Tip" },
  }[kind];
  return (
    <div className={`my-5 rounded-lg border ${styles.border} bg-[#141414] px-4 py-3.5`}>
      <p className={`text-[11px] font-semibold uppercase tracking-widest ${styles.label}`}>
        {title ?? styles.fallback}
      </p>
      <div className="mt-1.5 text-[14px] leading-relaxed text-[#c4c4c4] [&_code]:rounded [&_code]:bg-[#262626] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px]">
        {children}
      </div>
    </div>
  );
}

export function DocH1({ kicker, children }: { kicker?: string; children: React.ReactNode }) {
  return (
    <header className="mb-8">
      {kicker && (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f59e0b]">
          {kicker}
        </p>
      )}
      <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{children}</h1>
    </header>
  );
}

export function DocH2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="group mt-12 mb-4 scroll-mt-24 text-xl font-bold tracking-tight">
      <a href={`#${id}`} className="hover:text-[#f59e0b]">
        {children}
      </a>
    </h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-4 text-[15px] leading-7 text-[#b8b8b8] [&_a]:text-[#f59e0b] [&_a]:underline [&_a]:decoration-[#f59e0b]/40 [&_a]:underline-offset-2 hover:[&_a]:decoration-[#f59e0b] [&_code]:rounded [&_code]:bg-[#1f1f1f] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-[#e5e5e5] [&_strong]:font-semibold [&_strong]:text-[#f0f0f0]">
      {children}
    </p>
  );
}

export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="my-5 overflow-x-auto rounded-lg border border-[#262626]">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-[#262626] bg-[#141414]">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold text-[#e5e5e5]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-[#1f1f1f] last:border-0">
              {cells.map((c, j) => (
                <td
                  key={j}
                  className="px-4 py-2.5 align-top leading-relaxed text-[#a3a3a3] [&_code]:rounded [&_code]:bg-[#1f1f1f] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-[#e5e5e5]"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Prev/next footer navigation, derived from the shared nav order. */
export function DocsPager({ slug }: { slug: string }) {
  const { prev, next } = pagerFor(slug);
  if (!prev && !next) return null;
  return (
    <nav aria-label="Docs navigation" className="mt-14 grid gap-3 border-t border-[#262626] pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={docHref(prev.slug)}
          className="group rounded-lg border border-[#262626] p-4 transition-colors hover:border-[#404040]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#737373]">← Previous</p>
          <p className="mt-1 text-[14px] font-semibold text-[#e5e5e5] group-hover:text-[#f59e0b]">
            {prev.title}
          </p>
        </Link>
      ) : (
        <span aria-hidden className="hidden sm:block" />
      )}
      {next && (
        <Link
          href={docHref(next.slug)}
          className="group rounded-lg border border-[#262626] p-4 sm:text-right transition-colors hover:border-[#404040]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#737373]">Next →</p>
          <p className="mt-1 text-[14px] font-semibold text-[#e5e5e5] group-hover:text-[#f59e0b]">
            {next.title}
          </p>
        </Link>
      )}
    </nav>
  );
}
