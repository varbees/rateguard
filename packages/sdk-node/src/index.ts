export * from './types.js';
export * from './config.js';
export * from './runtime.js';
export * from './core/bounded-cache.js';
export * from './core/rate-limiter.js';
export * from './core/token-budget.js';
export * from './core/circuit-breaker.js';
export * from './core/event-emitter.js';
export * from './core/mcp.js';
export * from './core/guardrails.js';
export * from './core/guardrail-log.js';
export * from './core/genai.js';
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
import { middleware as expressMiddleware } from './adapters/express.js';
import { rateguardPlugin } from './adapters/fastify.js';
import { rateguard } from './adapters/hono.js';
import { withRateGuard } from './adapters/next.js';
import type { RateGuardOptions } from './types.js';

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

  /**
   * Wrap fetch with outbound GenAI tracking: budgets, per-provider circuit
   * breakers, real token usage metering, optional provider fallback.
   * Pass the result to any LLM SDK that accepts a custom fetch.
   */
  wrapFetch(options: WrapFetchOptions = {}): typeof fetch {
    return wrapFetch(this.runtime, options);
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
