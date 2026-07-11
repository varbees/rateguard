export * from './types.js';
export * from './config.js';
export * from './runtime.js';
export * from './core/bounded-cache.js';
export * from './core/rate-limiter.js';
export * from './core/sharded-limiter.js';
export * from './core/redis-limiter.js';
export * from './core/adaptive.js';
export * from './core/token-budget.js';
export * from './core/circuit-breaker.js';
export * from './core/event-emitter.js';
export * from './core/mcp.js';
export * from './core/mcp-server.js';
export * from './core/budget-attestation.js';
export * from './core/admin.js';
export * from './core/guardrails.js';
export * from './core/guardrail-log.js';
export * from './core/tokenizer.js';
export * from './core/genai.js';
export * from './core/genai-span.js';
export * from './core/enforcement-log.js';
export * from './core/semantic-cache.js';
export * from './core/semantic-loop.js';
export * from './core/spend-receipt.js';
export * from './core/focus-export.js';
export * from './core/realtime.js';
export * from './core/static-embedder.js';
export * from './core/prometheus.js';
export * from './core/outbound.js';
export {
  ProviderChain,
  defaultProviderChain,
  budgetProviderChain,
  qualityProviderChain,
  type ProviderEntry,
} from './core/provider-chain.js';
export * from './adapters/express.js';
export * from './adapters/fastify.js';
export * from './adapters/hono.js';
export * from './adapters/next.js';

import { RateGuardRuntime } from './runtime.js';
import { createMCPTools, mcpCall, type LoopDetector, type MCPTool, type MCPToolResult } from './core/mcp.js';
import type { GuardrailLog } from './core/guardrail-log.js';
import { wrapFetch, type WrapFetchOptions } from './core/outbound.js';
import { startGenAICall as openGenAISpan, type GenAIObserver, type GenAISpan } from './core/genai-span.js';
import type { GenAICall } from './core/genai.js';
import type { EnforcementEvent } from './core/enforcement-log.js';
import { middleware as expressMiddleware } from './adapters/express.js';
import { rateguardPlugin } from './adapters/fastify.js';
import { rateguard } from './adapters/hono.js';
import { withRateGuard } from './adapters/next.js';
import type { PolicyPreset, PolicyUpdate, RateGuardOptions } from './types.js';

/**
 * Convenience class that mirrors the Go SDK's top-level ergonomics.
 */
export class RateGuard {
  readonly runtime: RateGuardRuntime;
  private tools?: MCPTool[];

  constructor(options: RateGuardOptions = {}) {
    this.runtime = new RateGuardRuntime(options);
  }

  /**
   * Loop detector shared with the actual middleware admission path (not a
   * separate standalone instance) — MCP pre-flight checks and the real
   * request-time loop detection see the same fingerprint state.
   */
  get loopDetector(): LoopDetector {
    return this.runtime.loopDetector;
  }

  /** Guardrail violation log shared with the middleware's 422 rejection path. */
  get guardrailLog(): GuardrailLog {
    return this.runtime.guardrailLog;
  }

  /** MCP tool set for agent pre-flight queries. Peek semantics — never consumes budget. */
  mcpTools(): MCPTool[] {
    if (!this.tools) {
      this.tools = createMCPTools(this.runtime, this.runtime.loopDetector, this.runtime.guardrailLog);
    }
    return this.tools;
  }

  /** Execute an MCP tool by name and wrap the result as MCP content. */
  mcpCall(toolName: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
    return mcpCall(this.mcpTools(), toolName, args);
  }

  /** Current effective policy preset. Mirrors Go's SDK.Policy(). */
  policy(): PolicyPreset {
    return this.runtime.policy();
  }

  /**
   * Applies a partial policy override (in-memory only) and returns the
   * resulting effective policy. The admission hot path reads the updated
   * limits on its next decision. Mirrors Go's SDK.SetPolicy.
   */
  setPolicy(update: PolicyUpdate): PolicyPreset {
    return this.runtime.setPolicy(update);
  }

  /**
   * Wrap fetch with outbound GenAI tracking: budgets, per-provider circuit
   * breakers, real token usage metering, optional provider fallback.
   * Pass the result to any LLM SDK that accepts a custom fetch.
   */
  wrapFetch(options: WrapFetchOptions = {}): typeof fetch {
    return wrapFetch(this.runtime, options);
  }

  /**
   * Kill switch: halt outbound LLM calls for a scope from inside the process.
   * Empty scope ('') freezes everything; any other value freezes that customer
   * (the X-RateGuard-Customer header). Frozen calls return a synthesized 403.
   */
  freeze(scope = ''): void {
    this.runtime.freeze.freeze(scope);
  }

  /** Lift a freeze set by {@link freeze}. */
  unfreeze(scope = ''): void {
    this.runtime.freeze.unfreeze(scope);
  }

  /** Whether a scope is currently frozen. */
  isFrozen(scope = ''): boolean {
    return this.runtime.freeze.isFrozen(scope);
  }

  /** The active freezes: '*' for a global freeze, 'customer=<id>' per customer. */
  frozenScopes(): string[] {
    return this.runtime.freeze.frozenScopes();
  }

  /**
   * Recent enforcement events (budget stops, rate limits, freezes), newest
   * first. `limit <= 0` returns every buffered event. The pull-side audit
   * trail — no webhook required — for finance and the compliance record.
   */
  enforcementEvents(limit = 0): EnforcementEvent[] {
    return this.runtime.enforcementLog.recent(limit);
  }

  /**
   * Opens a GenAI observability span for one outbound LLM call — token
   * counts, cost estimation, and (for streaming calls) TTFT/TPOT timing.
   * Mirrors Go's SDK.StartGenAICall.
   */
  startGenAICall(call: Partial<GenAICall> = {}, observer?: GenAIObserver): GenAISpan {
    return openGenAISpan(this.runtime.config.clock, call, observer, this.runtime.config.pricingProvider);
  }

  /**
   * Current adaptive rate-limit scaling factor (1.0 = configured policy), or
   * undefined when `adaptiveRateLimit` isn't enabled. Mirrors Go's
   * SDK.AdaptiveRateLimitFactor().
   */
  adaptiveRateLimitFactor(): number | undefined {
    return this.runtime.adaptiveRateLimitFactor();
  }

  /** Current EMA of upstream error rate driving the adaptive controller, or undefined when disabled. */
  adaptiveRateLimitErrorRate(): number | undefined {
    return this.runtime.adaptiveRateLimitErrorRate();
  }

  middleware() {
    return expressMiddleware(this.runtime);
  }

  fastify() {
    return (instance: Parameters<typeof rateguardPlugin>[0]) => rateguardPlugin(instance, this.runtime);
  }

  hono() {
    return rateguard(this.runtime);
  }

  withRateGuard<TContext = Record<string, never>>(handler: (request: Request, context: TContext) => Response | Promise<Response>) {
    return withRateGuard(handler, this.runtime);
  }

  static middleware(options: RateGuardOptions = {}) {
    return expressMiddleware(options);
  }

  static fastify(options: RateGuardOptions = {}) {
    return (instance: Parameters<typeof rateguardPlugin>[0]) => rateguardPlugin(instance, options);
  }

  static hono(options: RateGuardOptions = {}) {
    return rateguard(options);
  }

  static withRateGuard<TContext = Record<string, never>>(
    handler: (request: Request, context: TContext) => Response | Promise<Response>,
    options: RateGuardOptions = {},
  ) {
    return withRateGuard(handler, options);
  }
}
