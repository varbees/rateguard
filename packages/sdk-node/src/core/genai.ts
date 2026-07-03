/**
 * GenAI OpenTelemetry observability — matching Go SDK implementation.
 *
 * Emits gen_ai.* spans for every LLM call passing through RateGuard.
 * Token counting, cost estimation (28 models priced), streaming chunk telemetry,
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
  'o3':                  { prompt: 0.010,   completion: 0.040 },
  'o4-mini':             { prompt: 0.0011,  completion: 0.0044 },
  // Anthropic
  'claude-opus-4-5':     { prompt: 0.015,   completion: 0.075 },
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

/** Estimate USD cost for an LLM call based on 2026 market rates. */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING_2026[model];
  if (!pricing) return 0; // unknown model — don't fabricate costs
  return (promptTokens / 1000) * pricing.prompt + (completionTokens / 1000) * pricing.completion;
}

/** Return all priced model names. */
export function pricedModels(): string[] {
  return Object.keys(MODEL_PRICING_2026);
}

// ── OpenTelemetry attribute builders ──

/** Build OTel attributes for GenAI span start. */
export function genaiSpanAttributes(call: GenAICall): Record<string, string | number | boolean> {
  return {
    'gen_ai.system': call.provider,
    'gen_ai.request.model': call.model,
    'gen_ai.operation.name': call.operation,
    'gen_ai.request.is_stream': call.streaming,
    'rateguard.rate_limit.applied': call.rateLimitApplied,
    'rateguard.token_budget.applied': call.tokenBudgetApplied,
    'rateguard.circuit_breaker.state': call.circuitBreakerState,
  };
}

/** Build OTel attributes for GenAI span end (with token counts). */
export function genaiSpanEndAttributes(call: GenAICall, latencySeconds: number): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {
    'gen_ai.usage.prompt_tokens': call.promptTokens,
    'gen_ai.usage.completion_tokens': call.completionTokens,
    'gen_ai.usage.total_tokens': call.totalTokens,
    'gen_ai.usage.cost_usd': call.estimatedCostUSD,
    'gen_ai.latency_seconds': latencySeconds,
    'gen_ai.request.is_stream': call.streaming,
  };
  if (call.streaming) {
    attrs['gen_ai.stream.chunks'] = call.streamChunks;
  }
  if (call.tokenBudgetApplied) {
    attrs['rateguard.token_budget.remaining'] = call.tokenBudgetRemaining;
  }
  return attrs;
}
