import Link from "next/link";
import { docHref, pagerFor } from "../../lib/docs-nav";

/**
 * Inline callout. Monochrome by default (note/tip read as ink) — colour is spent
 * only where it carries danger (warn). No side-stripe: full hairline + tinted
 * surface, per the design system.
 */
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
    note: { border: "border-[var(--border)]", label: "text-[var(--fg)]", surface: "bg-[var(--card)]", fallback: "Note" },
    warn: { border: "border-[#c2410c]/30", label: "text-[#b91c1c]", surface: "bg-[#fdf3f0]", fallback: "Watch out" },
    tip: { border: "border-[var(--border)]", label: "text-[var(--fg)]", surface: "bg-[var(--card)]", fallback: "Tip" },
  }[kind];
  return (
    <div className={`my-6 rounded-lg border ${styles.border} ${styles.surface} px-4 py-3.5`}>
      <p className={`text-[11px] font-semibold uppercase tracking-widest ${styles.label}`}>
        {title ?? styles.fallback}
      </p>
      <div className="mt-1.5 text-[14px] leading-relaxed text-[var(--body)] [&_code]:rounded [&_code]:bg-[var(--code-bg)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-[var(--fg)]">
        {children}
      </div>
    </div>
  );
}

export function DocH1({ kicker, children }: { kicker?: string; children: React.ReactNode }) {
  return (
    <header className="mb-9">
      {kicker && (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          {kicker}
        </p>
      )}
      <h1 className="font-display text-[2rem] font-bold leading-[1.15] tracking-tight text-[var(--fg)] sm:text-[2.5rem]">
        {children}
      </h1>
    </header>
  );
}

export function DocH2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="group mt-14 mb-4 scroll-mt-24 text-[1.35rem] font-bold tracking-tight text-[var(--fg)]">
      <a href={`#${id}`} className="no-underline">
        {children}
        <span className="ml-2 text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
          #
        </span>
      </a>
    </h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-4 max-w-[68ch] text-[15px] leading-7 text-[var(--body)] [&_a]:font-medium [&_a]:text-[var(--fg)] [&_a]:underline [&_a]:decoration-[var(--border)] [&_a]:underline-offset-[3px] hover:[&_a]:decoration-[var(--fg)] [&_code]:rounded [&_code]:bg-[var(--code-bg)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-[var(--fg)] [&_strong]:font-semibold [&_strong]:text-[var(--fg)]">
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
    <div className="my-6 overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--card)]">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold text-[var(--fg)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-[var(--border)] last:border-0">
              {cells.map((c, j) => (
                <td
                  key={j}
                  className="px-4 py-2.5 align-top leading-relaxed text-[var(--body)] [&_code]:rounded [&_code]:bg-[var(--code-bg)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-[var(--fg)]"
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
    <nav aria-label="Docs navigation" className="mt-16 grid gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={docHref(prev.slug)}
          className="group rounded-lg border border-[var(--border)] p-4 transition-colors hover:border-[var(--fg)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">← Previous</p>
          <p className="mt-1 text-[14px] font-semibold text-[var(--fg)]">{prev.title}</p>
        </Link>
      ) : (
        <span aria-hidden className="hidden sm:block" />
      )}
      {next && (
        <Link
          href={docHref(next.slug)}
          className="group rounded-lg border border-[var(--border)] p-4 transition-colors hover:border-[var(--fg)] sm:text-right"
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">Next →</p>
          <p className="mt-1 text-[14px] font-semibold text-[var(--fg)]">{next.title}</p>
        </Link>
      )}
    </nav>
  );
}
