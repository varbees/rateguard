/**
 * Semantic response caching — Node port of Go's semantic cache
 * (packages/sdk-go/semantic_cache.go). Pure algorithm, no language issues.
 *
 * Exact-match caching misses the common case: two prompts that mean the
 * same thing but differ in wording never hit. Semantic caching embeds the
 * prompt and serves a prior response when a sufficiently similar prompt was
 * already answered — real cost and latency savings on workloads with
 * duplicate intent (support bots, agent retries, templated prompts with
 * small variations).
 *
 * RateGuard does not bundle an embedding model. That is a deliberate scope
 * decision, not an oversight: an embedding runtime (a hosted embeddings API,
 * a local model binding) is exactly the kind of external dependency
 * RateGuard's "zero infrastructure, zero added attack surface" positioning
 * exists to avoid. Instead, `Embedder` is a one-method interface — bring the
 * OpenAI/Cohere/Voyage embeddings API, a local sentence-transformer binding,
 * or anything else that turns text into a vector. RateGuard supplies the
 * cache: bounded storage, cosine similarity search, TTL, and (via
 * outbound.ts) the transport wiring that skips the network entirely on a
 * hit.
 *
 * Honest scope: streaming requests (`"stream": true`) are never cached — a
 * cached response is a full JSON body, and replaying it as a fabricated SSE
 * stream would misrepresent timing (TTFT/TPOT) to the caller. Streaming
 * calls always execute for real.
 */

import type { Clock } from '../types.js';

/**
 * Turns text into a vector embedding. Implementations decide the
 * dimensionality and model; RateGuard only requires that equal-meaning text
 * produce vectors with high cosine similarity.
 */
export interface Embedder {
  embed(text: string): Promise<number[]>;
}

/** Configures semantic caching for one outbound transport. */
export interface SemanticCacheOptions {
  /** Required — there is no default embedding model. */
  embedder: Embedder;
  /** Minimum cosine similarity (0-1) for a cache hit. Default 0.92 — conservative; lower it deliberately per workload. */
  similarityThreshold?: number;
  /** How long a cached response stays eligible for reuse. Default 1 hour. */
  ttlMs?: number;
  /**
   * Bounds memory per provider+model scope. Default 500. Eviction is
   * oldest-first once the bound is hit — this is a cache, not a vector
   * database; workloads needing more should look upstream of RateGuard
   * (Redis, a real vector store) and are out of scope here.
   */
  maxEntriesPerScope?: number;
}

interface ResolvedSemanticCacheOptions {
  embedder: Embedder;
  similarityThreshold: number;
  ttlMs: number;
  maxEntriesPerScope: number;
}

function withDefaults(options: SemanticCacheOptions): ResolvedSemanticCacheOptions {
  return {
    embedder: options.embedder,
    similarityThreshold:
      typeof options.similarityThreshold === 'number' && options.similarityThreshold > 0 ? options.similarityThreshold : 0.92,
    ttlMs: typeof options.ttlMs === 'number' && options.ttlMs > 0 ? options.ttlMs : 60 * 60 * 1000,
    maxEntriesPerScope:
      typeof options.maxEntriesPerScope === 'number' && options.maxEntriesPerScope > 0 ? options.maxEntriesPerScope : 500,
  };
}

/** A cached provider response, replayed verbatim on a semantic-cache hit. */
export interface CachedLLMResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface SemanticCacheEntry {
  embedding: number[];
  response: CachedLLMResponse;
  expiresAt: number;
}

/**
 * The internal engine behind `SemanticCacheOptions`: a bounded, per-scope
 * (`provider:model`) linear scan over embeddings. Linear scan is correct and
 * simple at the size this cache is meant for (hundreds of entries per model,
 * not millions) — an ANN index would be premature infrastructure for what is
 * meant to be a zero-dependency, in-process cache.
 */
export class SemanticCache {
  private readonly opts: ResolvedSemanticCacheOptions;
  private readonly clock: Clock;
  private readonly scopes = new Map<string, SemanticCacheEntry[]>();

  constructor(options: SemanticCacheOptions, clock: Clock) {
    this.opts = withDefaults(options);
    this.clock = clock;
  }

  /** Delegates to the configured Embedder. */
  embed(text: string): Promise<number[]> {
    return this.opts.embedder.embed(text);
  }

  /**
   * Returns the best matching cached response for `embedding` in `scope`, if
   * its similarity meets the configured threshold. Expired entries are
   * pruned lazily on access.
   */
  lookup(scope: string, embedding: number[]): CachedLLMResponse | undefined {
    const now = this.clock.now();
    const entries = this.scopes.get(scope);
    if (!entries || entries.length === 0) {
      return undefined;
    }

    const live: SemanticCacheEntry[] = [];
    let best: SemanticCacheEntry | undefined;
    let bestScore = -1;
    for (const entry of entries) {
      if (now > entry.expiresAt) {
        continue; // pruned: dropped from live
      }
      live.push(entry);
      const score = cosineSimilarity(embedding, entry.embedding);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    this.scopes.set(scope, live);

    if (!best || bestScore < this.opts.similarityThreshold) {
      return undefined;
    }
    return best.response;
  }

  /**
   * Records a fresh response under `scope`, keyed by its embedding.
   * Oldest-first eviction keeps each scope within `maxEntriesPerScope`.
   */
  store(scope: string, embedding: number[], response: CachedLLMResponse): void {
    const entries = this.scopes.get(scope) ?? [];
    entries.push({ embedding, response, expiresAt: this.clock.now() + this.opts.ttlMs });

    const over = entries.length - this.opts.maxEntriesPerScope;
    this.scopes.set(scope, over > 0 ? entries.slice(over) : entries);
  }
}

/**
 * Cosine similarity of two equal-length vectors, or 0 for
 * mismatched/empty/zero-norm inputs.
 * Source: https://en.wikipedia.org/wiki/Cosine_similarity
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    // noUncheckedIndexedAccess: loop bound is a.length === b.length, so
    // these reads are always in range.
    const av = a[i] as number;
    const bv = b[i] as number;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Request introspection for caching ──
// (Response usage extraction already exists in utils.ts / outbound.ts; these
// helpers are cache-specific: "is this cacheable" and "what's the prompt
// text to embed".)

/**
 * Reports whether the request body asked for a streamed response
 * (`"stream": true`) — streaming requests are never cached.
 */
export function isStreamingRequestBody(bodyText: string): boolean {
  if (!bodyText) {
    return false;
  }
  try {
    const payload: unknown = JSON.parse(bodyText);
    return Boolean(payload && typeof payload === 'object' && (payload as { stream?: unknown }).stream === true);
  } catch {
    return false;
  }
}

interface ChatRequestBody {
  system?: unknown;
  messages?: Array<{ role?: unknown; content?: unknown }>;
}

/**
 * Extracts a stable text representation of the prompt from an OpenAI- or
 * Anthropic-shaped chat request body, for embedding. Multimodal parts other
 * than text (images, audio) are ignored — semantic caching only reasons
 * about text content.
 */
export function promptTextFromRequestBody(bodyText: string): string {
  if (!bodyText) {
    return '';
  }

  let payload: ChatRequestBody;
  try {
    payload = JSON.parse(bodyText) as ChatRequestBody;
  } catch {
    return '';
  }
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  let out = '';
  const systemText = contentText(payload.system);
  if (systemText) {
    out += `system: ${systemText}\n`;
  }
  for (const message of payload.messages ?? []) {
    const text = contentText(message?.content);
    if (!text) {
      continue;
    }
    const role = typeof message?.role === 'string' ? message.role : '';
    out += `${role}: ${text}\n`;
  }
  return out;
}

/**
 * Decodes an OpenAI/Anthropic "content" field, which is either a plain
 * string or an array of typed parts (`{"type":"text","text":"..."}` plus
 * non-text parts this function ignores).
 */
function contentText(raw: unknown): string {
  if (raw === undefined || raw === null) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    const parts: string[] = [];
    for (const part of raw as unknown[]) {
      if (
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string' &&
        (part as { text: string }).text
      ) {
        parts.push((part as { text: string }).text);
      }
    }
    return parts.join(' ');
  }
  return '';
}
