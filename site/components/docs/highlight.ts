import "server-only";
import { createHighlighter, type Highlighter } from "shiki";

// Build-time syntax highlighting for the docs.
//
// Why Shiki, not a client highlighter: this runs during static generation, so
// the coloured HTML is baked into the page and the highlighter itself never
// reaches the browser — zero runtime cost, and the code is legible before a
// single byte of JS loads.
//
// Why a minimal LIGHT theme (min-light): the docs are light and monochrome, so
// the code must feel the same — calm, low-chroma, no warm/orange tokens that
// would fight the ink palette. Colour still maps to SEMANTIC WEIGHT, not
// decoration: comments recede (muted grey), while strings/keywords/functions
// stay distinct enough to resolve the code's shape at a glance. Restraint over
// a rainbow — the page's job is reading, not a light show.

// Only the languages the docs actually use. Fine-grained keeps the build lean.
const LANGS = ["go", "typescript", "javascript", "python", "bash", "json", "diff"] as const;
const THEME = "min-light";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  // Module-level singleton: one highlighter reused across every code block in the
  // build, instead of spinning up the WASM engine per block.
  highlighterPromise ??= createHighlighter({ themes: [THEME], langs: [...LANGS] });
  return highlighterPromise;
}

// A docs tab label (or CodeBlock title) mapped to a Shiki grammar. The Node.js
// samples are typed, so TypeScript's grammar (a superset of JS) gives the richest
// tokens. Anything unrecognised (e.g. "Formula") falls back to plain text rather
// than mis-highlighting.
export function langFor(label: string | undefined): string {
  switch ((label ?? "").trim().toLowerCase()) {
    case "go":
      return "go";
    case "node.js":
    case "node":
    case "typescript":
    case "ts":
    case "javascript":
    case "js":
      return "typescript";
    case "python":
    case "py":
    case "pipecat":
    case "livekit agents":
      return "python";
    case "bash":
    case "sh":
    case "shell":
    case "terminal":
      return "bash";
    case "json":
      return "json";
    case "diff":
      return "diff";
    default:
      return "text";
  }
}

// Returns Shiki's <pre><code>…</code></pre> HTML. Background is stripped so the
// tokens sit on the block's own near-black brand surface (one cohesive surface,
// per the design system) rather than Shiki's cooler default panel colour.
export async function highlight(code: string, label: string | undefined): Promise<string> {
  const lang = langFor(label);
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang,
    theme: THEME,
    colorReplacements: {
      // Drop min-light's white panel; the CodeTabs/CodeBlock container owns the
      // surface (a warm-neutral --code-bg), so tokens sit on one cohesive block.
      "#ffffff": "transparent",
    },
  });
}
