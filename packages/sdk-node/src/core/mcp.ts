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
import type { GuardrailLog } from './guardrail-log.js';
import type { RateGuardRuntime } from '../runtime.js';
import {
  attest,
  newRootBudgetToken,
  parseBudgetToken,
  privateKeyFromRaw,
  privateKeyToRaw,
  publicKeyFromRawBytes,
  publicKeyToRaw,
  verifyChain,
  verifyPresentation,
  type BudgetGrant,
} from './budget-attestation.js';

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
export function createMCPTools(runtime: RateGuardRuntime, loops?: LoopDetector, guardrailLog?: GuardrailLog): MCPTool[] {
  const detector = loops ?? runtime.loopDetector;
  const guardLog = guardrailLog ?? runtime.guardrailLog;

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
    const decision = await runtime.rateLimiter.peek(key, rateLimitOptions());
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

    // Defaults to false — a "check" tool is a pre-flight query (AGENTS.md
    // rule 5: "Pre-flight queries never consume. Peek, never Allow"), and
    // this tool's own description says exactly that ("Does not record...
    // unless 'record' is true"). A caller that omits the field entirely
    // must get the passive peek behavior its own docs promise, not a
    // silent check that records/mutates state on their behalf.
    const record = typeof args.record === 'boolean' ? args.record : false;
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

  const mcpArgStrings = (args: Record<string, unknown>, field: string): string[] | undefined => {
    const raw = args[field];
    if (!Array.isArray(raw)) {
      return undefined;
    }
    return raw.filter((entry): entry is string => typeof entry === 'string');
  };

  const attestBudget = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const signingKeyB64 = typeof args.signing_key === 'string' ? args.signing_key : '';
    if (!signingKeyB64) {
      throw new Error('mcp: signing_key is required');
    }
    const signingKey = privateKeyFromRaw(Buffer.from(signingKeyB64, 'base64'));

    const expiresInSeconds = typeof args.expires_in_seconds === 'number' ? args.expires_in_seconds : Number.NaN;
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error('mcp: expires_in_seconds is required and must be positive');
    }

    const providers = mcpArgStrings(args, 'providers');
    const models = mcpArgStrings(args, 'models');
    const grant: BudgetGrant = {
      maxTokens: typeof args.max_tokens === 'number' ? args.max_tokens : 0,
      maxDepth: typeof args.max_depth === 'number' ? args.max_depth : 0,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      ...(providers ? { providers } : {}),
      ...(models ? { models } : {}),
    };

    const delegatePublicKeyB64 = typeof args.delegate_public_key === 'string' ? args.delegate_public_key : '';
    const opts = {
      grant,
      ...(delegatePublicKeyB64 ? { delegatePublicKey: publicKeyFromRawBytes(Buffer.from(delegatePublicKeyB64, 'base64')) } : {}),
    };

    let result;
    const parentTokenStr = typeof args.parent_token === 'string' ? args.parent_token : '';
    try {
      result = parentTokenStr ? attest(parseBudgetToken(parentTokenStr), signingKey, opts) : newRootBudgetToken(signingKey, opts);
    } catch (error) {
      return { error: (error as Error).message };
    }

    const lastBlock = result.token.blocks[result.token.blocks.length - 1]!;
    const response: Record<string, unknown> = {
      token: result.token.marshal(),
      delegate_public_key: publicKeyToRaw(lastBlock.delegatePublicKey).toString('base64'),
      max_tokens: grant.maxTokens,
      max_depth: grant.maxDepth,
      expires_at: grant.expiresAt.toISOString(),
      depth: result.token.blocks.length,
    };
    if (result.delegatePrivateKey) {
      response.delegate_private_key = privateKeyToRaw(result.delegatePrivateKey).toString('base64');
    }
    return response;
  };

  const verifyBudget = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const tokenStr = typeof args.token === 'string' ? args.token : '';
    if (!tokenStr) {
      throw new Error('mcp: token is required');
    }
    const rootPublicKeyB64 = typeof args.root_public_key === 'string' ? args.root_public_key : '';
    if (!rootPublicKeyB64) {
      throw new Error('mcp: root_public_key is required');
    }
    const rootPublicKey = publicKeyFromRawBytes(Buffer.from(rootPublicKeyB64, 'base64'));

    let token;
    try {
      token = parseBudgetToken(tokenStr);
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }

    const contextStr = typeof args.context === 'string' ? args.context : '';
    const signatureB64 = typeof args.signature === 'string' ? args.signature : '';
    let grant: BudgetGrant;
    let proofVerified = false;

    try {
      if (contextStr && signatureB64) {
        grant = verifyPresentation(token, rootPublicKey, Buffer.from(contextStr), Buffer.from(signatureB64, 'base64'));
        proofVerified = true;
      } else {
        grant = verifyChain(token, rootPublicKey);
      }
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }

    return {
      valid: true,
      proof_of_possession_verified: proofVerified,
      depth: token.blocks.length,
      effective_grant: {
        max_tokens: grant.maxTokens,
        providers: grant.providers ?? [],
        models: grant.models ?? [],
        max_depth: grant.maxDepth,
        expires_at: grant.expiresAt.toISOString(),
      },
    };
  };

  const listLimits = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const key = typeof args.key === 'string' ? args.key : '';
    if (!key) {
      throw new Error('mcp: key is required');
    }

    // "enabled" reflects whether guardrails are configured at all, not just
    // whether the tracking log exists (it always does) — an instance with
    // no guardrails configured has nothing to violate, which is a
    // different state from "configured and clean." Mirrors Go's mcp.go.
    const guardStats = guardLog.stats();
    guardStats.enabled = Boolean(runtime.config.guardrails);

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
      guardrails: guardStats,
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
          record: { type: 'boolean', description: 'When true, record this fingerprint+depth so future checks can detect repeats. Defaults to false — a bare check never mutates state.' },
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
    {
      name: 'attest_budget',
      description:
        "Mint or delegate a cryptographic budget token an agent can hand to a sub-agent it invokes. Omit parent_token to mint a new root token (signing_key becomes the trust anchor verifiers must already know). Pass parent_token to delegate further — the new grant must narrow the parent's (less budget, fewer providers/models, less delegation depth, an earlier expiry); signing_key must be the private key matching parent_token's current holder.",
      inputSchema: {
        type: 'object',
        properties: {
          signing_key: {
            type: 'string',
            description: 'Base64 Ed25519 private key: the root authority key when minting (parent_token absent), or the current holder\'s key when delegating (parent_token present)',
          },
          parent_token: {
            type: 'string',
            description: 'Existing serialized budget token to delegate from. Omit to mint a new root token.',
          },
          delegate_public_key: {
            type: 'string',
            description: 'Base64 Ed25519 public key of the recipient, if it already generated its own keypair (recommended — its private key never transits through this call). Omit to have RateGuard generate a fresh keypair and return the private key.',
          },
          max_tokens: {
            type: 'integer',
            description: 'Token budget for this grant. <= 0 means unlimited, but only if the parent grant is also unlimited.',
          },
          providers: {
            type: 'array',
            items: { type: 'string' },
            description: "Restrict to these LLM providers. Omit for 'any provider', but only if the parent grant also allows any.",
          },
          models: {
            type: 'array',
            items: { type: 'string' },
            description: 'Restrict to these models, same rule as providers.',
          },
          max_depth: {
            type: 'integer',
            description: 'How many further delegations this grant allows (0 = recipient may use it but not delegate further).',
          },
          expires_in_seconds: {
            type: 'integer',
            description: 'Grant lifetime from now, in seconds. Required — budget tokens must expire.',
          },
        },
        required: ['signing_key', 'max_depth', 'expires_in_seconds'],
      },
      handler: attestBudget,
    },
    {
      name: 'verify_budget',
      description:
        "Verify a budget token before honoring it. Always checks the signature chain, that every delegation narrowed its parent, and that nothing has expired. Pass context+signature for a full authorization check (proof that the presenter actually holds the token, not just read it) — without them this only confirms the token's terms are well-formed, not who is presenting it.",
      inputSchema: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Serialized budget token to verify' },
          root_public_key: {
            type: 'string',
            description: 'Base64 Ed25519 public key of the trusted root authority (known out-of-band, like a CA root certificate)',
          },
          context: {
            type: 'string',
            description: 'Challenge/context the presenter should have signed with their holder key, for proof-of-possession',
          },
          signature: {
            type: 'string',
            description: "Base64 signature over 'context', produced by the token holder's private key (rateguard sign()) — proves the presenter, not just a token they saw, holds the delegation",
          },
        },
        required: ['token', 'root_public_key'],
      },
      handler: verifyBudget,
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
