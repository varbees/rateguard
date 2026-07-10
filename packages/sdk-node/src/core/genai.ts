/**
 * GenAI OpenTelemetry observability — matching Go SDK implementation.
 *
 * Emits gen_ai.* spans for every LLM call passing through RateGuard.
 * Token counting, cost estimation (14 models priced, verified), streaming chunk telemetry,
 * budget exhaustion + rate limit hit counters.
 *
 * OpenTelemetry GenAI semantic conventions v1.29.0 (2026)
 * https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai
 */

export interface GenAICall {
  model: string;              // e.g. "gpt-4o", "claude-opus-4-5"
  provider: string;           // e.g. "openai", "anthropic", "google"
  operation: 'chat' | 'text_completion' | 'embedding';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  streaming: boolean;
  streamChunks: number;
  /** TTFT — time to first token/chunk (ms) */
  timeToFirstChunkMs: number;
  /** TPOT — average time per output chunk (ms) */
  timePerOutputChunkMs: number;
  /** OTel gen_ai.conversation.id */
  conversationId?: string;
  /** OTel gen_ai.response.id */
  responseId?: string;
  estimatedCostUSD: number;
  rateLimitApplied: boolean;
  tokenBudgetApplied: boolean;
  tokenBudgetRemaining: number;
  circuitBreakerState: string;
}

// ── Model pricing (2026 market rates, USD per 1K tokens) ──

const MODEL_PRICING_2026: Record<string, { prompt: number; completion: number }> = {
  // OpenAI
  'gpt-4o':              { prompt: 0.0025,  completion: 0.010 },
  'gpt-4o-mini':         { prompt: 0.00015, completion: 0.0006 },
  'gpt-4.1':             { prompt: 0.002,   completion: 0.008 },
  'gpt-4.1-mini':        { prompt: 0.0001,  completion: 0.0004 },
  'o3':                  { prompt: 0.002,   completion: 0.008 },
  'o4-mini':             { prompt: 0.0011,  completion: 0.0044 },
  // Anthropic
  'claude-opus-4-5':     { prompt: 0.005,   completion: 0.025 },
  'claude-sonnet-4':     { prompt: 0.003,   completion: 0.015 },
  'claude-haiku-3.5':    { prompt: 0.0008,  completion: 0.004 },
  // Google
  'gemini-2.5-pro':      { prompt: 0.00125, completion: 0.010 },
  'gemini-2.5-flash':    { prompt: 0.000075,completion: 0.0003 },
  // Open source / hosted
  'llama-3.3-70b':       { prompt: 0.00059, completion: 0.00079 },
  'deepseek-v3':         { prompt: 0.00027, completion: 0.0011 },
  'deepseek-r1':         { prompt: 0.00055, completion: 0.00219 },
};

/** USD cost per 1,000 tokens for one model, prompt (input) and completion (output). */
export interface ModelPrice {
  promptUSDPer1K: number;
  completionUSDPer1K: number;
}

/**
 * Resolves a per-1K-token price for a model. Return undefined to fall through
 * to the built-in starter table (then to zero — costs are never fabricated).
 * Same optional-interface pattern as Embedder/EventEmitter: bring your own, or
 * use StaticPricing. Costs are observability estimates only; they never drive
 * enforcement (the token budget is token-count based).
 */
export interface PricingProvider {
  priceFor(model: string): ModelPrice | undefined;
}

/**
 * A PricingProvider backed by a caller-owned map — the answer to "the model I
 * use isn't in your table." Register base names; a dated snapshot the provider
 * reports back ("gpt-4o-2024-08-06") resolves via normalization.
 */
export class StaticPricing implements PricingProvider {
  constructor(private readonly prices: Record<string, ModelPrice>) {}
  priceFor(model: string): ModelPrice | undefined {
    return this.prices[model] ?? this.prices[normalizeModelId(model)];
  }
}

// Trailing date/preview noise a provider appends to a base model ID. A bare
// "-N" (a minor version like "claude-sonnet-4-5") is intentionally NOT stripped.
const ISO_DATE = /-\d{4}-\d{2}-\d{2}$/; // OpenAI: -2024-08-06
const COMPACT_DATE = /-\d{8}$/; // Anthropic: -20250929
const MONTH_YEAR = /-\d{2}-\d{4}$/; // Gemini: -09-2025

/**
 * Lower-cases a model name and strips trailing date/preview suffixes so a
 * provider-reported snapshot ID matches a base pricing key. Conservative: it
 * removes only recognizable date shapes and -preview/-latest/-exp aliases,
 * never meaningful words (mini, nano, lite, pro) or minor-version digits.
 */
export function normalizeModelId(model: string): string {
  let m = model.trim().toLowerCase();
  for (;;) {
    const orig = m;
    m = m.replace(ISO_DATE, '').replace(COMPACT_DATE, '').replace(MONTH_YEAR, '');
    for (const suffix of ['-preview', '-latest', '-exp']) {
      if (m.endsWith(suffix)) m = m.slice(0, -suffix.length);
    }
    if (m === orig) return m;
  }
}

function builtinPriceFor(model: string): ModelPrice | undefined {
  const p = MODEL_PRICING_2026[model] ?? MODEL_PRICING_2026[normalizeModelId(model)];
  return p ? { promptUSDPer1K: p.prompt, completionUSDPer1K: p.completion } : undefined;
}

/**
 * Price a call: caller's PricingProvider first, then the built-in starter
 * table (normalized), then zero. Never fabricates a cost.
 */
export function estimateCostWith(
  pricing: PricingProvider | undefined,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = pricing?.priceFor(model) ?? builtinPriceFor(model);
  if (!price) return 0;
  return (promptTokens / 1000) * price.promptUSDPer1K + (completionTokens / 1000) * price.completionUSDPer1K;
}

/**
 * Estimate USD cost from the built-in starter table (model-ID normalized, so
 * a dated snapshot matches its base entry). Unknown models return zero. For
 * custom/not-yet-tabled models, supply a PricingProvider (see StaticPricing).
 */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  return estimateCostWith(undefined, model, promptTokens, completionTokens);
}

/** Return all priced model names. */
export function pricedModels(): string[] {
  return Object.keys(MODEL_PRICING_2026);
}

// ── OpenTelemetry attribute builders ──

/** Span name per OTel GenAI semantic conventions: "{operation} {model}". */
export function genaiSpanName(call: GenAICall): string {
  const operation = call.operation || 'chat';
  return call.model ? `${operation} ${call.model}` : operation;
}

/** Maps an error to a low-cardinality error.type per OTel semantic conventions.
 *  Full messages are high-cardinality and break error filtering in backends. */
export function classifyErrorType(error: Error): string {
  return error.name || 'Error';
}

/** Build OTel attributes for GenAI span start. */
export function genaiSpanAttributes(call: GenAICall): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {
    'gen_ai.provider.name': call.provider,
    'gen_ai.request.model': call.model,
    'gen_ai.operation.name': call.operation || 'chat',
    'rateguard.request.is_stream': call.streaming,
    'rateguard.rate_limit.applied': call.rateLimitApplied,
    'rateguard.token_budget.applied': call.tokenBudgetApplied,
    'rateguard.circuit_breaker.state': call.circuitBreakerState,
  };
  if (call.conversationId) {
    result['gen_ai.conversation.id'] = call.conversationId;
  }
  return result;
}

/** Build OTel attributes for GenAI span end (with token counts).
 *  If error is provided, adds error.type per OTel semantic conventions. */
export function genaiSpanEndAttributes(call: GenAICall, latencySeconds: number, error?: Error): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {
    'gen_ai.usage.input_tokens': call.promptTokens,
    'gen_ai.usage.output_tokens': call.completionTokens,
    'rateguard.usage.total_tokens': call.totalTokens,
    'rateguard.usage.cost_usd': call.estimatedCostUSD,
    'rateguard.request.is_stream': call.streaming,
  };
  if (call.streaming) {
    attrs['rateguard.stream.chunks'] = call.streamChunks;
  }
  if (call.streaming && call.timeToFirstChunkMs > 0) {
    attrs['gen_ai.client.operation.time_to_first_chunk'] = call.timeToFirstChunkMs;
  }
  if (call.streaming && call.timePerOutputChunkMs > 0) {
    attrs['gen_ai.client.operation.time_per_output_chunk'] = call.timePerOutputChunkMs;
  }
  if (call.tokenBudgetApplied) {
    attrs['rateguard.token_budget.remaining'] = call.tokenBudgetRemaining;
  }
  if (error) {
    attrs['error.type'] = classifyErrorType(error);
  }
  if (call.responseId) {
    attrs['gen_ai.response.id'] = call.responseId;
  }
  return attrs;
}
