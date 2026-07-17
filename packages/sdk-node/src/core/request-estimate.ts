import { estimateWith, type Tokenizer } from './tokenizer.js';

// ── Per-request budget estimation ──
//
// A hard-stop reservation bounds how much budget one in-flight call holds.
// Reserve too little and concurrent callers can collectively overshoot the
// limit; reserve everything and calls serialize.
//
// The outbound transport used to reserve a flat 4096 tokens for every call,
// chosen once at wrap time — before any request existed. Measured under
// concurrency (see the Go SDK's token_budget_concurrency_test.go), overshoot
// is bounded by:
//
//     overshoot <= limit * (actual / estimate)
//
// So the overshoot factor is exactly how wrong the estimate is. A flat 4096 is
// fine for a typical chat call and ~25x wrong for a 100K-token RAG call, which
// makes long-context agents — the workload most able to burn a budget — the
// workload least protected by it. That is backwards, and it is the
// denial-of-wallet hole this module closes.
//
// The transport already has the request body in hand (fallback retry needs
// it), so estimate from what the caller is ACTUALLY sending:
//
//     estimate = tokens(prompt text) + declared output ceiling
//
// The prompt is measurable exactly. The completion is not knowable up front,
// but the request usually declares its own ceiling (max_tokens /
// max_completion_tokens / maxOutputTokens) — providers do not exceed it, so it
// is a true upper bound rather than a guess.
//
// Bias: this deliberately OVER-estimates rather than under. Over-reserving
// costs concurrency; under-reserving costs money. Only one is a security
// property.

/**
 * Reserved for the completion when a request declares no ceiling of its own.
 * Providers default to "until the model stops", so there is no true bound to
 * read — this is an allowance, not a measurement, and it is the one guess left.
 */
export const DEFAULT_OUTPUT_ALLOWANCE = 4096;

/**
 * Caps the body size this will parse. Beyond it, fall back to reserve-all (the
 * safe direction) rather than spend unbounded CPU on the hot path.
 */
export const MAX_ESTIMATE_BODY_BYTES = 4 << 20; // 4 MiB

/** Text out of a content field that is a string, typed parts, or bare strings. */
function contentText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (!Array.isArray(raw)) return '';
  const out: string[] = [];
  for (const part of raw) {
    if (typeof part === 'string') {
      out.push(part);
    } else if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
      // Non-text parts (images, audio) are skipped: their token cost is
      // provider-specific and not derivable from the request bytes.
      out.push((part as { text: string }).text);
    }
  }
  return out.join('\n');
}

/**
 * Bounds an unrecognized request by its own size: the prompt is necessarily a
 * subset of the body, so counting every byte as prompt text cannot under-count.
 * It over-counts by the JSON scaffolding, which is the direction that protects
 * the budget.
 */
function wholeBodyUpperBound(body: string, tokenizer?: Tokenizer): number {
  return estimateWith(tokenizer, body) + DEFAULT_OUTPUT_ALLOWANCE;
}

/**
 * Derives a budget reservation from the request itself: measured prompt tokens
 * plus the output ceiling the request declares.
 *
 * Unknown schemas do NOT fall back to reserve-all. Reserve-all serializes every
 * call on the budget key, so one unrecognized request shape would quietly
 * throttle a whole application on upgrade — trading a cost bug for an
 * availability bug. Unparseable bodies are bounded by their size instead.
 *
 * Returns 0 ("reserve the entire remaining budget") only for an empty body or
 * one too large to walk — both pathological for an LLM call.
 */
export function estimateRequestTokens(body: string | undefined, tokenizer?: Tokenizer): number {
  if (!body || body.length === 0 || body.length > MAX_ESTIMATE_BODY_BYTES) {
    return 0;
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return wholeBodyUpperBound(body, tokenizer);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return wholeBodyUpperBound(body, tokenizer);
  }

  const chunks: string[] = [];

  // OpenAI chat completions.
  const messages = payload.messages;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (message && typeof message === 'object') {
        const text = contentText((message as { content?: unknown }).content);
        if (text) chunks.push(text);
      }
    }
  }

  // OpenAI legacy completions / embeddings; Anthropic system.
  for (const key of ['prompt', 'input', 'system'] as const) {
    const text = contentText(payload[key]);
    if (text) chunks.push(text);
  }

  // Google Gemini.
  const contents = payload.contents;
  if (Array.isArray(contents)) {
    for (const entry of contents) {
      const parts = (entry as { parts?: unknown })?.parts;
      const text = contentText(parts);
      if (text) chunks.push(text);
    }
  }
  const systemInstruction = payload.systemInstruction as { parts?: unknown } | undefined;
  if (systemInstruction) {
    const text = contentText(systemInstruction.parts);
    if (text) chunks.push(text);
  }

  const promptText = chunks.join('\n');
  if (!promptText) {
    // Valid JSON carrying no field we recognize as a prompt: a newer API
    // shape, or a provider we have not taught this. Bound it by size rather
    // than serialize the caller.
    return wholeBodyUpperBound(body, tokenizer);
  }

  const input = estimateWith(tokenizer, promptText);

  const ceiling = (value: unknown): number | undefined =>
    typeof value === 'number' && value > 0 ? value : undefined;

  const generationConfig = payload.generationConfig as { maxOutputTokens?: unknown } | undefined;
  const output =
    ceiling(payload.max_completion_tokens) ??
    ceiling(payload.max_tokens) ??
    ceiling(generationConfig?.maxOutputTokens) ??
    DEFAULT_OUTPUT_ALLOWANCE;

  return input + output;
}
