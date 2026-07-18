import { CopyButton } from "./CopyButton";
import { highlight } from "./highlight";

// Re-exported so existing `import { CopyButton } from "./CodeBlock"` call sites
// keep working after CopyButton moved to its own client module.
export { CopyButton };

// Server component: highlights at build time, ships coloured HTML + zero JS for
// the code itself. `title` doubles as the language hint (e.g. "Go", "Bash").
export async function CodeBlock({
  code,
  title,
}: {
  code: string;
  title?: string;
}) {
  const html = await highlight(code, title);
  return (
    <div className="group my-6 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--muted)]">
          {title ?? "code"}
        </span>
        <CopyButton text={code} />
      </div>
      <div
        className="shiki-block overflow-x-auto p-4 text-[13px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
