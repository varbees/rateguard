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

export function defaultProviderChain(): ProviderChain {
  return new ProviderChain([
    ProviderChain.provider('openai', 'gpt-4o', 'https://api.openai.com/v1'),
    ProviderChain.provider('anthropic', 'claude-sonnet-4', 'https://api.anthropic.com/v1'),
    ProviderChain.provider('google', 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta'),
  ]);
}

export function budgetProviderChain(): ProviderChain {
  return new ProviderChain([
    ProviderChain.provider('google', 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta'),
    ProviderChain.provider('openai', 'gpt-4o-mini', 'https://api.openai.com/v1'),
    ProviderChain.provider('anthropic', 'claude-haiku-3.5', 'https://api.anthropic.com/v1'),
  ]);
}

export function qualityProviderChain(): ProviderChain {
  return new ProviderChain([
    ProviderChain.provider('anthropic', 'claude-opus-4-5', 'https://api.anthropic.com/v1'),
    ProviderChain.provider('openai', 'gpt-4o', 'https://api.openai.com/v1'),
    ProviderChain.provider('google', 'gemini-2.5-pro', 'https://generativelanguage.googleapis.com/v1beta'),
  ]);
}
