/**
 * MCP (Model Context Protocol) Tools — Agent-Native Rate Limit Awareness
 *
 * RateGuard exposes its rate limit state as MCP tools that AI agents can query
 * BEFORE making LLM calls. This eliminates 429 errors, retry storms, and wasted tokens.
 *
 * Matching Go SDK implementation: packages/sdk-go/mcp.go + loop_detector.go
 * All pre-flight tools use peek semantics — querying never consumes budget.
 */

import { createHash } from 'node:crypto';

import { BoundedCache } from './bounded-cache.js';
import type { RateGuardRuntime } from '../runtime.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
}

// ── Loop Detector (matching Go's loop_detector.go) ──

interface FingerprintEntry {
  depth: number;
  halted: boolean;
}

const DEFAULT_LOOP_DETECTOR_CAPACITY = 10_000;

export class LoopDetector {
  private fingerprints: BoundedCache<string, FingerprintEntry>;
  private maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth > 0 ? maxDepth : 50;
    this.fingerprints = new BoundedCache<string, FingerprintEntry>(DEFAULT_LOOP_DETECTOR_CAPACITY);
  }

  static fingerprint(systemPrompt: string, userInput: string, toolDefinitions: string): string {
    const hash = createHash('sha256');
    hash.update(systemPrompt);
    hash.update(userInput);
    hash.update(toolDefinitions);
    return hash.digest('hex');
  }

  check(fingerprint: string, sequenceDepth: number): { allowed: boolean; reason: string } {
    return this.evaluate(fingerprint, sequenceDepth, true);
  }

  /** Pre-flight variant: evaluates without recording the fingerprint. */
  peek(fingerprint: string, sequenceDepth: number): { allowed: boolean; reason: string } {
    return this.evaluate(fingerprint, sequenceDepth, false);
  }

  private evaluate(fingerprint: string, sequenceDepth: number, record: boolean): { allowed: boolean; reason: string } {
    if (sequenceDepth > this.maxDepth) {
      if (record) {
        this.fingerprints.set(fingerprint, { depth: sequenceDepth, halted: true });
      }
      return {
        allowed: false,
        reason: `max sequence depth exceeded: depth ${sequenceDepth} > limit ${this.maxDepth}`,
      };
    }

    const entry = this.fingerprints.get(fingerprint);
    if (!entry) {
      if (record) {
        this.fingerprints.set(fingerprint, { depth: sequenceDepth, halted: false });
      }
      return { allowed: true, reason: '' };
    }

    if (entry.halted) {
      return {
        allowed: false,
        reason: `execution halted: payload fingerprint ${fingerprint.slice(0, 12)} was previously blocked for loop behavior at depth ${entry.depth}`,
      };
    }

    if (sequenceDepth > entry.depth) {
      if (record) {
        entry.halted = true;
      }
      return {
        allowed: false,
        reason: `loop detected: payload fingerprint ${fingerprint.slice(0, 12)} repeated at depth ${sequenceDepth} (previously seen at depth ${entry.depth})`,
      };
    }

    if (record) {
      entry.depth = sequenceDepth;
    }
    return { allowed: true, reason: '' };
  }

  loopCheck(systemPrompt: string, userInput: string, toolDefinitions: string, sequenceDepth: number): { allowed: boolean; reason: string } {
    const fp = LoopDetector.fingerprint(systemPrompt, userInput, toolDefinitions);
    return this.check(fp, sequenceDepth);
  }

  reset(): void {
    this.fingerprints = new BoundedCache<string, FingerprintEntry>(DEFAULT_LOOP_DETECTOR_CAPACITY);
  }

  stats(): Record<string, unknown> {
    let halted = 0;
    for (const entry of this.fingerprints.values()) {
      if (entry.halted) halted++;
    }
    return {
      enabled: true,
      max_depth: this.maxDepth,
      total_fingerprints: this.fingerprints.size(),
      halted,
    };
  }
}

// ── MCP tools (matching Go's mcp.go: 5 tools) ──

/**
 * Builds the RateGuard MCP tool set bound to a runtime. Agents call these
 * tools to query their limits before making API calls.
 */
export function createMCPTools(runtime: RateGuardRuntime, loops?: LoopDetector): MCPTool[] {
  const detector = loops ?? new LoopDetector();

  const rateLimitOptions = () => ({
    requestsPerSecond: runtime.config.rateLimit.requestsPerSecond,
    burst: runtime.config.rateLimit.burst,
    windowMs: runtime.config.rateLimit.windowMs,
    remoteRateLimitEndpoint: runtime.config.rateLimit.remoteRateLimitEndpoint,
    apiKey: runtime.config.apiKey,
  });

  const getRateLimitState = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const key = typeof args.key === 'string' ? args.key : '';
    if (!key) {
      throw new Error('mcp: key is required');
    }
    const decision = runtime.rateLimiter.peek(key, rateLimitOptions());
    return {
      key,
      allowed: decision.allowed,
      remaining: decision.remaining,
      limit: decision.limit,
      retry_after_ms: decision.retryAfterMs,
      applied: decision.applied,
    };
  };

  const getTokenBudget = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const key = typeof args.key === 'string' ? args.key : '';
    if (!key) {
      throw new Error('mcp: key is required');
    }
    const decision = runtime.tokenBudget.check(key, runtime.config.tokenBudget);
    if (!decision.applied) {
      return { key, allowed: true, applied: false, error: 'no budget configured for this key' };
    }

    const result: Record<string, unknown> = {
      key,
      remaining: decision.remaining,
      limit: decision.limit,
      applied: decision.applied,
      allowed: decision.allowed,
    };
    const estimated = typeof args.estimated_tokens === 'number' ? args.estimated_tokens : 0;
    if (estimated > 0) {
      result.estimated_tokens = estimated;
      result.would_fit = decision.remaining >= estimated;
    }
    return result;
  };

  const getCircuitBreakerState = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const state = runtime.circuitBreaker.getState();
    const result: Record<string, unknown> = {
      state,
      allowed: state !== 'open',
    };
    if (typeof args.upstream_id === 'string' && args.upstream_id) {
      result.upstream_id = args.upstream_id;
    }
    return result;
  };

  const checkLoop = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const depth = typeof args.sequence_depth === 'number' ? args.sequence_depth : Number.NaN;
    if (!Number.isFinite(depth)) {
      throw new Error('mcp: sequence_depth is required');
    }

    let fingerprint = typeof args.fingerprint === 'string' ? args.fingerprint : '';
    if (!fingerprint) {
      const systemPrompt = typeof args.system_prompt === 'string' ? args.system_prompt : '';
      const userInput = typeof args.user_input === 'string' ? args.user_input : '';
      const toolDefs = typeof args.tool_definitions === 'string' ? args.tool_definitions : '';
      if (!systemPrompt && !userInput && !toolDefs) {
        throw new Error('mcp: fingerprint or prompt fields are required');
      }
      fingerprint = LoopDetector.fingerprint(systemPrompt, userInput, toolDefs);
    }

    const record = typeof args.record === 'boolean' ? args.record : true;
    const outcome = record ? detector.check(fingerprint, depth) : detector.peek(fingerprint, depth);

    const result: Record<string, unknown> = {
      allowed: outcome.allowed,
      fingerprint,
      sequence_depth: depth,
    };
    if (outcome.reason) {
      result.reason = outcome.reason;
    }
    return result;
  };

  const listLimits = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const key = typeof args.key === 'string' ? args.key : '';
    if (!key) {
      throw new Error('mcp: key is required');
    }

    return {
      key,
      rate_limit: await getRateLimitState({ key }),
      token_budget: await getTokenBudget({ key }),
      circuit_breaker: await getCircuitBreakerState({}),
      preset: {
        name: runtime.config.preset.name,
        requests_per_second: runtime.config.rateLimit.requestsPerSecond,
        burst: runtime.config.rateLimit.burst,
      },
      loop_detector: detector.stats(),
    };
  };

  return [
    {
      name: 'get_rate_limit_state',
      description:
        'Query current rate limit state for a key BEFORE making API calls. Returns remaining tokens, limit, reset time, and whether the call would be allowed. Use this to avoid 429 errors.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Rate limit key (user ID, API key, tenant ID)' } },
        required: ['key'],
      },
      handler: getRateLimitState,
    },
    {
      name: 'get_token_budget',
      description:
        'Check remaining LLM token budget before making an expensive call. Returns remaining tokens, limit, budget mode, and whether the estimated tokens fit within budget.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Budget key (user ID, tenant)' },
          estimated_tokens: { type: 'integer', description: 'How many tokens the agent expects to use' },
        },
        required: ['key'],
      },
      handler: getTokenBudget,
    },
    {
      name: 'get_circuit_breaker_state',
      description:
        'Check circuit breaker health for upstream providers before attempting calls. Returns state (closed/open/half-open) and whether calls are allowed.',
      inputSchema: {
        type: 'object',
        properties: {
          upstream_id: { type: 'string', description: "Upstream provider or service to check (e.g. 'openai', 'anthropic')" },
        },
        required: ['upstream_id'],
      },
      handler: getCircuitBreakerState,
    },
    {
      name: 'check_loop',
      description:
        "Pre-flight loop check: report whether an identical payload fingerprint has already been seen at a lower sequence depth (a runaway agent loop). Call before repeating a tool call or LLM request. Does not record the fingerprint unless 'record' is true.",
      inputSchema: {
        type: 'object',
        properties: {
          fingerprint: { type: 'string', description: 'SHA-256 payload fingerprint. Alternatively pass system_prompt/user_input/tool_definitions.' },
          system_prompt: { type: 'string', description: "System prompt to fingerprint (used when 'fingerprint' is absent)" },
          user_input: { type: 'string', description: "User input to fingerprint (used when 'fingerprint' is absent)" },
          tool_definitions: { type: 'string', description: "Serialized tool definitions to fingerprint (used when 'fingerprint' is absent)" },
          sequence_depth: { type: 'integer', description: 'Current agent sequence depth (how many chained steps deep this call is)' },
          record: { type: 'boolean', description: 'When true, record this fingerprint+depth so future checks can detect repeats. Defaults to true.' },
        },
        required: ['sequence_depth'],
      },
      handler: checkLoop,
    },
    {
      name: 'list_limits',
      description:
        'Full snapshot of all rate limits, token budgets, and circuit breaker states for a key. Convenience tool for agent initialization.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Rate limit key to query' } },
        required: ['key'],
      },
      handler: listLimits,
    },
  ];
}

/**
 * Executes an MCP tool by name and wraps the result as MCP content.
 */
export async function mcpCall(tools: MCPTool[], toolName: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    const available = tools.map((candidate) => candidate.name).join(', ');
    throw new Error(`mcp: unknown tool "${toolName}" — available: ${available}`);
  }
  const result = await tool.handler(args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
