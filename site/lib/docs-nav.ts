export type DocPage = { slug: string; title: string };
export type DocSection = { label: string; pages: DocPage[] };

// Single source of truth for the docs IA: sidebar, pager, and metadata all
// derive from this list. Order matters — the pager walks it linearly.
export const docsNav: DocSection[] = [
  {
    label: "Get started",
    pages: [
      { slug: "", title: "Introduction" },
      { slug: "quickstart", title: "Quickstart" },
      { slug: "presets", title: "Presets" },
    ],
  },
  {
    label: "Guides",
    pages: [
      { slug: "agents-mcp", title: "Agents & MCP" },
      { slug: "outbound", title: "Track LLM spend" },
      { slug: "rate-limiting", title: "Rate limit your API" },
      { slug: "token-budgets", title: "Token budgets" },
      { slug: "loop-detection", title: "Loop detection" },
      { slug: "provider-fallback", title: "Provider fallback" },
      { slug: "guardrails", title: "Guardrails" },
      { slug: "observability", title: "Observability" },
    ],
  },
  {
    label: "Integrations",
    pages: [{ slug: "integrations", title: "Agent frameworks" }],
  },
  {
    label: "Reference",
    pages: [{ slug: "configuration", title: "Configuration" }],
  },
];

export const flatPages: DocPage[] = docsNav.flatMap((s) => s.pages);

export function pagerFor(slug: string): { prev: DocPage | null; next: DocPage | null } {
  const i = flatPages.findIndex((p) => p.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? flatPages[i - 1] : null,
    next: i < flatPages.length - 1 ? flatPages[i + 1] : null,
  };
}

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}
