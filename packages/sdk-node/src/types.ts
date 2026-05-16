/**
 * Canonical RateGuard preset names.
 */
export type PresetName =
  | 'dev'
  | 'standard'
  | 'high-throughput'
  | 'llm-heavy'
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
  clock?: Clock;
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
  eventEmitter: EventEmitterLike;
  clock: Clock;
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
  statusCode?: 429 | 503;
  errorCode?: AdmissionErrorCode;
  body?: string;
  retryAfterMs?: number;
  rateLimit?: RateLimitDecision;
  tokenBudget?: TokenBudgetDecision;
  circuitBreaker?: CircuitBreakerDecision;
}

/**
 * Runtime outcome after a request completes.
 */
export interface CompletionObservation {
  statusCode: number;
  snapshot?: ResponseSnapshot;
  error?: Error | undefined;
}
