import "server-only";
import { createHighlighter, type Highlighter } from "shiki";

// Build-time syntax highlighting for the docs.
//
// Why Shiki, not a client highlighter: this runs during static generation, so
// the coloured HTML is baked into the page and the highlighter itself never
// reaches the browser — zero runtime cost, and the code is legible before a
// single byte of JS loads.
//
// Why the GitHub-dark palette specifically: a docs reader is a developer
// mid-task, and they read this exact palette every day on GitHub itself. Reusing
// it means their mental model transfers with no learning curve — a keyword is the
// colour they already expect a keyword to be. Colour maps to SEMANTIC WEIGHT, not
// decoration: comments recede (muted grey, low contrast — deprioritised by the
// eye), while the tokens that carry meaning (strings, keywords, function names,
// numbers) stay distinct and high-clarity. That is pre-attentive parsing: the
// eye resolves the shape of the code before it reads a word.

// Only the languages the docs actually use. Fine-grained keeps the build lean.
const LANGS = ["go", "typescript", "javascript", "python", "bash", "json", "diff"] as const;
const THEME = "github-dark-default";

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
      // Drop Shiki's panel background; the CodeTabs/CodeBlock container owns it.
      "#0d1117": "transparent",
    },
  });
}
