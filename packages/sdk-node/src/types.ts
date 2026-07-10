import type { Guardrail } from './core/guardrails.js';
import type { PricingProvider } from './core/genai.js';
import type { RedisLimiterClient } from './core/redis-limiter.js';

/**
 * Canonical RateGuard preset names.
 */
export type PresetName =
  | 'dev'
  | 'standard'
  | 'high-throughput'
  | 'streaming-llm'
  | 'agent-orchestrator'
  | 'llm-heavy'
  | 'mcp-server'
  | 'strict-upstream-protection';

/**
 * Token budget enforcement mode.
 */
export type TokenBudgetMode = 'hard-stop' | 'soft-stop';

/**
 * Clock abstraction for deterministic tests.
 */
export interface Clock {
  now(): number;
}

/**
 * Canonical preset definition used by the SDK.
 */
export interface PolicyPreset {
  name: PresetName;
  requestsPerSecond: number;
  burst: number;
  maxApis: number;
  monthlyRequestLimit: number;
  maxRequestsPerDay: number;
  maxRequestsPerMonth: number;
  maxTokensPerMonth: number;
  tokenBudgetPerHour: number;
  tokenBudgetPerDay: number;
  tokenBudgetPerMonth: number;
  tokenBudgetMode: TokenBudgetMode;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  customRateLimits: boolean;
  webhooks: boolean;
  apiAccess: boolean;
  analyticsRetentionDays: number;
}

/**
 * Partial policy override for RateGuardRuntime.setPolicy: omitted fields
 * leave the corresponding policy field unchanged. Intended for runtime
 * admin/control-plane use (see createAdminHandler) — not for the request
 * hot path. Mirrors Go's PolicyUpdate in sdk.go.
 */
export interface PolicyUpdate {
  requestsPerSecond?: number;
  burst?: number;
  tokenBudgetPerHour?: number;
  tokenBudgetPerDay?: number;
  tokenBudgetPerMonth?: number;
  tokenBudgetMode?: TokenBudgetMode | string;
}

/**
 * Rate-limit configuration.
 */
export interface RateLimitOptions {
  requestsPerSecond?: number;
  burst?: number;
  windowMs?: number;
  remoteRateLimitEndpoint?: string;
}

/**
 * Token-budget configuration.
 */
export interface TokenBudgetOptions {
  hourLimit?: number;
  dayLimit?: number;
  monthLimit?: number;
  mode?: TokenBudgetMode;
  softStopAt?: number;
}

/**
 * Circuit-breaker configuration.
 */
export interface CircuitBreakerOptions {
  errorRateThreshold?: number;
  openTimeoutMs?: number;
  halfOpenSuccessesRequired?: number;
  sampleSize?: number;
}

/**
 * Tunes the AIMD adaptive rate-limiting controller. The zero value (all
 * fields omitted) selects the documented defaults. Mirrors Go's
 * AdaptiveOptions in adaptive.go.
 */
export interface AdaptiveOptions {
  /** Lower bound on the policy scaling factor (default 0.25). */
  minFactor?: number;
  /** Upper bound on the policy scaling factor (default 2.0). */
  maxFactor?: number;
  /** Upstream error rate the controller steers under (default 0.05). */
  targetErrorRate?: number;
  /** Additive factor gain per healthy adjust interval (default 0.05). */
  increaseStep?: number;
  /** Multiplicative factor cut on a breach (default 0.5). */
  decreaseFactor?: number;
  /** Minimum time between controller adjustments (default 1000ms). */
  adjustIntervalMs?: number;
  /** EMA weight applied to each new outcome sample (default 0.2). */
  emaAlpha?: number;
}

/**
 * Root configuration accepted by the Node SDK.
 */
export interface RateGuardOptions {
  apiKey?: string;
  preset?: string;
  tenantId?: string;
  routeId?: string;
  upstreamId?: string;
  provider?: string;
  model?: string;
  controlPlaneUrl?: string;
  wsUrl?: string;
  keyFn?: (request: RequestContext) => string;
  rateLimit?: RateLimitOptions;
  tokenBudget?: TokenBudgetOptions;
  circuitBreaker?: CircuitBreakerOptions;
  eventEmitter?: EventEmitterLike;
  /**
   * HTTP webhook endpoint events are POSTed to when no eventEmitter is
   * set. Mirrors Go's cfg.EventEndpoint. Delivery is wrapped in
   * AsyncEventEmitter (bounded queue, never blocks the request path).
   */
  eventEndpoint?: string;
  /** Bounds the async event queue used with eventEndpoint. Default 1024. */
  eventQueueSize?: number;
  clock?: Clock;
  /**
   * Content guardrail chain checked against request bodies (PII, prompt
   * injection, length). Mirrors Go's cfg.Guardrails — undefined disables
   * the check entirely (the default).
   */
  guardrails?: Guardrail;
  /**
   * Supplies USD-per-1K-token prices for cost estimates, checked before the
   * built-in starter table. Bring your own, or use StaticPricing for a map of
   * custom/fine-tuned/not-yet-tabled models. Mirrors Go's cfg.PricingProvider.
   * Cost is an observability estimate only — it never drives enforcement.
   */
  pricingProvider?: PricingProvider;
  /**
   * Header read for per-customer budget attribution on outbound LLM calls
   * (default x-rateguard-customer). Mirrors Go's cfg.OutboundCustomerHeader.
   */
  outboundCustomerHeader?: string;
  /**
   * Enables agent loop detection for requests carrying an X-Sequence-Depth
   * header. Mirrors Go's cfg.LoopDetection. Opt-in, defaults to false.
   */
  loopDetection?: boolean;
  /**
   * Bounds hard-stop token budget reservations: zero (default) reserves the
   * entire remaining budget per in-flight request (serializes concurrent
   * requests on the same key); a positive value reserves
   * min(estimate, remaining) so concurrent requests can proceed. Mirrors
   * Go's cfg.EstimatedTokensPerRequest.
   */
  estimatedTokensPerRequest?: number;
  /**
   * Enables the AIMD adaptive rate-limiting controller, which scales the
   * effective rps/burst up or down from observed upstream success/error
   * outcomes instead of trusting the configured policy forever. Mirrors
   * Go's cfg.AdaptiveRateLimit. Opt-in, defaults to false.
   */
  adaptiveRateLimit?: boolean;
  /** Tunes the adaptive controller. Mirrors Go's cfg.Adaptive. */
  adaptive?: AdaptiveOptions;
  /**
   * When set, rate limiting is served by a distributed Redis-backed GCRA
   * limiter instead of the default in-process one — every RateGuard
   * instance sharing the same Redis key space observes the same admission
   * state. Mirrors Go's cfg.RedisClient. Bring your own already-constructed
   * client adapted to this minimal structural interface (see
   * core/redis-limiter.ts for an ioredis adapter example); RateGuard has no
   * Redis runtime dependency of its own.
   */
  redisClient?: RedisLimiterClient;
}

/**
 * Resolved configuration after applying defaults and preset values.
 */
export interface ResolvedRateGuardOptions {
  apiKey: string | undefined;
  preset: PolicyPreset;
  tenantId: string;
  routeId: string;
  upstreamId: string;
  provider: string | undefined;
  model: string | undefined;
  controlPlaneUrl: string | undefined;
  wsUrl: string | undefined;
  keyFn: ((request: RequestContext) => string) | undefined;
  rateLimit: Required<RateLimitOptions>;
  tokenBudget: Required<TokenBudgetOptions>;
  circuitBreaker: Required<CircuitBreakerOptions>;
  eventEmitter: EventEmitterLike | undefined;
  eventEndpoint: string | undefined;
  eventQueueSize: number | undefined;
  clock: Clock;
  guardrails: Guardrail | undefined;
  pricingProvider: PricingProvider | undefined;
  outboundCustomerHeader: string | undefined;
  loopDetection: boolean;
  estimatedTokensPerRequest: number;
  adaptiveRateLimit: boolean;
  adaptive: Required<AdaptiveOptions>;
  redisClient: RedisLimiterClient | undefined;
}

/**
 * Lightweight request shape used internally by the adapters and runtime.
 */
export interface RequestContext {
  method: string;
  path: string;
  headers: HeadersLike;
  requestId: string;
  traceId: string;
  tenantId: string;
  routeId: string;
  upstreamId: string;
  provider: string | undefined;
  model: string | undefined;
}

/**
 * Supported header collection shapes.
 */
export type HeadersLike = Headers | Record<string, string | string[] | undefined>;

/**
 * Snapshot of a response body used for token extraction.
 */
export interface ResponseSnapshot {
  headers: HeadersLike;
  body: string;
  statusCode: number;
}

/**
 * Provider-derived token usage values.
 */
export interface TokenUsage {
  provider: string | undefined;
  model: string | undefined;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Per-request admission outcome.
 */
export interface RateLimitDecision {
  allowed: boolean;
  applied: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
  degraded: boolean;
}

/**
 * Raw, read-only bucket state for one key — the facts a RateLimitDecision
 * is computed from, without the allow/deny framing.
 */
export interface BucketState {
  tokens: number;
  capacity: number;
  limit: number;
}

export type AdmissionErrorCode =
  | 'circuit_open'
  | 'rate_limit_exceeded'
  | 'rate_limit_unavailable'
  | 'token_budget_exceeded';

/**
 * Per-request token-budget outcome.
 */
export interface TokenBudgetDecision {
  allowed: boolean;
  applied: boolean;
  queued: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
  window: 'hour' | 'day' | 'month' | '';
  warning: boolean;
}

/**
 * Circuit-breaker state machine state.
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit-breaker decision.
 */
export interface CircuitBreakerDecision {
  allowed: boolean;
  state: CircuitBreakerState;
  retryAfterMs: number;
  probeInFlight: boolean;
}

/**
 * Wire event types emitted to the control plane.
 */
export type RateGuardEventType =
  | 'request.completed'
  | 'request.rate_limited'
  | 'request.token_budget_exceeded';

/**
 * Canonical event payload used by the SDK.
 */
export interface RateGuardEventPayload {
  request_id?: string;
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
  rate_limit_applied: boolean;
  rate_limit_allowed: boolean;
  rate_limit_limit: number;
  rate_limit_remaining: number;
  retry_after_ms: number | undefined;
  preset: string;
  circuit_breaker_state: CircuitBreakerState;
  queue_depth: number;
  token_provider: string | undefined;
  token_model: string | undefined;
  token_input_tokens: number | undefined;
  token_output_tokens: number | undefined;
  token_total_tokens: number | undefined;
  token_budget_mode: TokenBudgetMode | undefined;
  token_budget_applied: boolean;
  token_budget_queued: boolean;
  token_budget_wait_ms: number | undefined;
  token_budget_limit: number | undefined;
  token_budget_remaining: number | undefined;
}

/**
 * Canonical envelope sent to the control plane.
 */
export interface RateGuardEventEnvelope {
  event_id: string;
  event_type: RateGuardEventType;
  tenant_id: string | undefined;
  route_id: string | undefined;
  upstream_id: string | undefined;
  trace_id: string | undefined;
  occurred_at: string;
  payload: RateGuardEventPayload;
}

/**
 * Event emitter contract.
 */
export interface EventEmitterLike {
  emit(event: RateGuardEventEnvelope): Promise<void>;
}

/**
 * Middleware decisions returned by the runtime before a request executes.
 */
export interface PreflightDecision {
  allowed: boolean;
  statusCode?: 429 | 503 | 422;
  errorCode?: AdmissionErrorCode;
  retryAfterMs?: number;
  rateLimit?: RateLimitDecision;
  tokenBudget?: TokenBudgetDecision;
  circuitBreaker?: CircuitBreakerDecision;
  tokenBudgetReservationId?: string;
  /**
   * Pre-built `{error, message}` rejection body for loop-detection (429) and
   * guardrail (422) denials — these don't fit the standard
   * `{error, retry_after_ms?}` denial shape, so adapters prefer this over
   * `denialPayload()` when it is set.
   */
  rejectionPayload?: { error: string; message: string };
}

/**
 * Runtime outcome after a request completes.
 */
export interface CompletionObservation {
  statusCode: number;
  snapshot?: ResponseSnapshot;
  error?: Error | undefined;
  tokenBudgetReservationId?: string;
}
