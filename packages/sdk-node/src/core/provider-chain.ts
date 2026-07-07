/**
 * Provider Chain — automatic LLM provider fallback.
 *
 * When the primary LLM provider returns 429/503 and the circuit breaker opens,
 * RateGuard auto-routes to the next provider in the chain.
 * No application code changes needed.
 *
 * Pattern: circuit-breaker → next provider → circuit-breaker → next provider
 */

export interface ProviderEntry {
  name: string;       // e.g. "openai", "anthropic", "google"
  model: string;      // e.g. "gpt-4o", "claude-sonnet-4"
  baseURL: string;    // e.g. "https://api.openai.com/v1"
  headers?: Record<string, string>;
  weight: number;     // lower = higher priority
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export class ProviderChain {
  private providers: ProviderEntry[];

  constructor(providers: ProviderEntry[]) {
    this.providers = providers;
  }

  /** Returns the first available provider after the failing one. */
  route(failingProvider: string | null, breakerState: CircuitBreakerState): ProviderEntry | undefined {
    if (!this.providers.length) return undefined;
    if (!failingProvider || breakerState === 'closed') return this.providers[0];

    let found = false;
    for (const p of this.providers) {
      if (p.name === failingProvider) { found = true; continue; }
      if (found) return p;
    }
    return this.providers[0]; // last resort
  }

  /** Create a new provider entry. */
  static provider(name: string, model: string, baseURL: string): ProviderEntry {
    return { name, model, baseURL, weight: name.length };
  }
}

// ── Preset chains ──
//
// Return ProviderEntry[] directly, NOT a ProviderChain instance — that
// class's .route() method is never called anywhere in the real request
// path (wrapFetch's fallback logic indexes options.chain as a plain array;
// see outbound.ts), so a ProviderChain wrapper here used to be a genuinely
// unusable public API: `wrapFetch({ chain: defaultProviderChain() })`
// failed to typecheck entirely (ProviderChain has none of Array's members).
// Confirmed by actually trying to compile that exact call, not by
// inspection alone.
//
// Every entry below must be a genuinely OpenAI-compatible endpoint — the
// outbound transport's fallback rewrites a failed request onto the next
// entry's baseURL by appending "/chat/completions" and re-sending the SAME
// OpenAI-shaped JSON body. That only works when the target actually speaks
// that schema. Anthropic's native Messages API does not (different path —
// /v1/messages, not /chat/completions — different request/response shape
// entirely), so it's deliberately absent here despite being a top-tier
// model: an earlier version of these three chains included it, and a
// reproduction test (mirroring Go's) confirmed the resulting fallback
// request really does get sent to Anthropic's real API at the wrong path
// with the wrong body shape — not a hypothetical concern. Google is
// included via its own OpenAI-compatible endpoint specifically (baseURL
// ends in /v1beta/openai, not bare /v1beta). If you need Anthropic in your
// own fallback logic, that has to happen at the application layer (catch
// the error, call Anthropic's own SDK yourself) — cross-schema fallback is
// impossible at the transport layer and is not claimed anywhere else in
// this package either.

export function defaultProviderChain(): ProviderEntry[] {
  return [
    ProviderChain.provider('openai', 'gpt-4o', 'https://api.openai.com/v1'),
    ProviderChain.provider('google', 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta/openai'),
  ];
}

export function budgetProviderChain(): ProviderEntry[] {
  return [
    ProviderChain.provider('google', 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta/openai'),
    ProviderChain.provider('openai', 'gpt-4o-mini', 'https://api.openai.com/v1'),
    ProviderChain.provider('deepseek', 'deepseek-chat', 'https://api.deepseek.com/v1'),
  ];
}

export function qualityProviderChain(): ProviderEntry[] {
  return [
    ProviderChain.provider('openai', 'gpt-4o', 'https://api.openai.com/v1'),
    ProviderChain.provider('google', 'gemini-2.5-pro', 'https://generativelanguage.googleapis.com/v1beta/openai'),
  ];
}
