import {
  createEventEmitter,
  buildEventEnvelope,
} from './core/event-emitter.js';
import { CircuitBreaker } from './core/circuit-breaker.js';
import { RateLimiter, type RateLimiterLike } from './core/rate-limiter.js';
import { AdaptiveLimiter } from './core/adaptive.js';
import { RedisGCRALimiter } from './core/redis-limiter.js';
import { TokenBudgetManager } from './core/token-budget.js';
import { LoopDetector } from './core/mcp.js';
import { GuardrailLog } from './core/guardrail-log.js';
import { readFirstHeader } from './core/utils.js';
import { normalizeTokenBudgetMode, resolveRateGuardOptions, systemClock } from './config.js';
import {
  type CompletionObservation,
  type CircuitBreakerDecision,
  type CircuitBreakerState,
  type PolicyPreset,
  type PolicyUpdate,
  type PreflightDecision,
  type RateGuardEventPayload,
  type RateGuardEventType,
  type RateGuardOptions,
  type RequestContext,
  type ResponseSnapshot,
  type TokenUsage,
} from './types.js';

/**
 * Bounds how much request body loop detection and guardrails read. Mirrors
 * Go's sdk.go maxInspectedBodyBytes — bodies beyond the cap are checked on
 * their prefix only.
 */
export const MAX_INSPECTED_BODY_BYTES = 256 * 1024;

export interface RequestBodyRejection {
  statusCode: 429 | 422;
  error: string;
  message: string;
}

/**
 * Shared runtime that powers all adapters.
 */
export class RateGuardRuntime {
  readonly config: ReturnType<typeof resolveRateGuardOptions>;
  readonly rateLimiter: RateLimiterLike;
  readonly tokenBudget: TokenBudgetManager;
  readonly circuitBreaker: CircuitBreaker;
  readonly eventEmitter: ReturnType<typeof createEventEmitter>;
  readonly loopDetector: LoopDetector;
  readonly guardrailLog: GuardrailLog;

  constructor(options: RateGuardOptions = {}) {
    this.config = resolveRateGuardOptions(options);

    let rateLimiter: RateLimiterLike;
    if (this.config.redisClient) {
      // Mirrors Go's New(): `case cfg.RedisClient != nil: limiter =
      // newRedisGCRALimiterWithClock(cfg.RedisClient, clock)` — a distributed
      // limiter replaces the in-process one entirely. Unlike Go, this SDK
      // does not additionally wrap it in AdaptiveLimiter even when
      // adaptiveRateLimit is also set: AdaptiveLimiter's peek is a sync
      // contract in this SDK (see adaptive.ts), and composing it over a
      // genuinely-async Redis limiter would either lie about that or force
      // every in-memory caller to start awaiting a peek that never blocks.
      // Redis is a complete replacement limiter, not an inner one to scale.
      rateLimiter = new RedisGCRALimiter(this.config.redisClient, this.config.clock);
    } else {
      rateLimiter = new RateLimiter({ clock: this.config.clock, capacity: 50_000 });
      if (this.config.adaptiveRateLimit) {
        // Mirrors Go's New(): `if cfg.AdaptiveRateLimit { limiter =
        // newAdaptiveLimiterWithClock(limiter, cfg.Adaptive, clock) }` — the
        // configured RateLimiter becomes the AIMD controller's inner limiter,
        // never replaced, only scaled.
        rateLimiter = new AdaptiveLimiter(rateLimiter, this.config.adaptive, this.config.clock);
      }
    }
    this.rateLimiter = rateLimiter;

    this.tokenBudget = new TokenBudgetManager({ clock: this.config.clock, capacity: 50_000 });
    this.circuitBreaker = new CircuitBreaker(this.config.clock, this.config.circuitBreaker);
    this.eventEmitter = createEventEmitter(this.config);
    this.loopDetector = new LoopDetector();
    this.guardrailLog = new GuardrailLog();
  }

  /**
   * Current effective policy preset for this runtime. A snapshot copy —
   * mutating the returned object does not change live policy (use setPolicy).
   * Mirrors Go's SDK.Policy().
   */
  policy(): PolicyPreset {
    return { ...this.config.preset };
  }

  /**
   * Atomically applies a partial override on top of the current policy and
   * returns the resulting effective policy. In-memory only — it does not
   * persist across restarts, and does not reset in-flight token budget or
   * circuit breaker state (those key off the policy's limits, which take
   * effect on the next check). Mirrors Go's SDK.SetPolicy.
   *
   * Updates BOTH the preset snapshot and the resolved rateLimit/tokenBudget
   * option objects the admission hot path actually reads, so a patched
   * policy changes real admission decisions, not just what GET /admin/policy
   * reports.
   */
  setPolicy(update: PolicyUpdate): PolicyPreset {
    if (typeof update.requestsPerSecond === 'number') {
      this.config.preset.requestsPerSecond = update.requestsPerSecond;
      this.config.rateLimit.requestsPerSecond = update.requestsPerSecond;
    }
    if (typeof update.burst === 'number') {
      this.config.preset.burst = update.burst;
      this.config.rateLimit.burst = update.burst;
    }
    if (typeof update.tokenBudgetPerHour === 'number') {
      this.config.preset.tokenBudgetPerHour = update.tokenBudgetPerHour;
      this.config.tokenBudget.hourLimit = update.tokenBudgetPerHour;
    }
    if (typeof update.tokenBudgetPerDay === 'number') {
      this.config.preset.tokenBudgetPerDay = update.tokenBudgetPerDay;
      this.config.tokenBudget.dayLimit = update.tokenBudgetPerDay;
    }
    if (typeof update.tokenBudgetPerMonth === 'number') {
      this.config.preset.tokenBudgetPerMonth = update.tokenBudgetPerMonth;
      this.config.preset.maxTokensPerMonth = update.tokenBudgetPerMonth;
      this.config.tokenBudget.monthLimit = update.tokenBudgetPerMonth;
    }
    if (typeof update.tokenBudgetMode === 'string') {
      const mode = normalizeTokenBudgetMode(update.tokenBudgetMode);
      this.config.preset.tokenBudgetMode = mode;
      this.config.tokenBudget.mode = mode;
    }
    return this.policy();
  }

  /**
   * Current adaptive rate-limit scaling factor (1.0 = configured policy), or
   * undefined when adaptive rate limiting isn't enabled. Mirrors Go's
   * SDK.AdaptiveRateLimitFactor().
   */
  adaptiveRateLimitFactor(): number | undefined {
    return this.rateLimiter instanceof AdaptiveLimiter ? this.rateLimiter.factor() : undefined;
  }

  /** Current EMA of upstream error rate driving the adaptive controller, or undefined when disabled. */
  adaptiveRateLimitErrorRate(): number | undefined {
    return this.rateLimiter instanceof AdaptiveLimiter ? this.rateLimiter.errorRate() : undefined;
  }

  /**
   * Whether this request needs its body read for loop detection or content
   * guardrail inspection. Adapters call this BEFORE consuming the body so
   * requests that don't need inspection never pay the cost of buffering
   * it. Mirrors the loopActive/guardActive gates in Go's checkRequestBody.
   */
  wantsRequestBody(request: RequestContext): boolean {
    const loopActive = this.config.loopDetection && readFirstHeader(request.headers, ['x-sequence-depth']) !== '';
    const guardActive = Boolean(this.config.guardrails) && request.method !== 'GET' && request.method !== 'HEAD';
    return loopActive || guardActive;
  }

  /**
   * Runs loop detection and content guardrails against an already-read
   * request body (bounded to MAX_INSPECTED_BODY_BYTES by the caller).
   * Mirrors Go's SDK.checkRequestBody. Returns null when the request may
   * proceed, or a rejection when it must be blocked (429 loop, 422
   * guardrail) — the caller must not invoke the downstream handler.
   */
  checkRequestBody(request: RequestContext, bodyText: string): RequestBodyRejection | null {
    const loopActive = this.config.loopDetection && readFirstHeader(request.headers, ['x-sequence-depth']) !== '';
    const guardActive = Boolean(this.config.guardrails) && request.method !== 'GET' && request.method !== 'HEAD';

    if (!loopActive && !guardActive) {
      return null;
    }

    if (loopActive) {
      const depth = Number.parseInt(readFirstHeader(request.headers, ['x-sequence-depth']), 10);
      if (!Number.isNaN(depth)) {
        const explicitFingerprint = readFirstHeader(request.headers, ['x-payload-fingerprint']);
        const fingerprint = explicitFingerprint || LoopDetector.fingerprint(request.method, request.path, bodyText);
        const outcome = this.loopDetector.check(fingerprint, depth);
        if (!outcome.allowed) {
          return { statusCode: 429, error: 'loop_detected', message: outcome.reason };
        }
      }
    }

    if (guardActive && bodyText.length > 0 && this.config.guardrails) {
      const violation = this.config.guardrails.check(bodyText);
      if (violation) {
        this.guardrailLog.record(violation);
        return { statusCode: 422, error: violation.code, message: violation.message };
      }
    }

    return null;
  }

  async admit(request: RequestContext, bodyText?: string): Promise<PreflightDecision> {
    const start = this.config.clock.now();
    const key = this.resolveKey(request);
    const breakerDecision = this.circuitBreaker.allow();
    // A half-open probe grant must be released if any later gate (rate
    // limit, guardrail, token budget) denies the request before it ever
    // reaches upstream — otherwise the probe slot leaks and the breaker
    // wedges in half-open forever (see CircuitBreaker.releaseProbe).
    // probeConsumed is set true right before returning the final allowed
    // decision; every early return falls through to the finally block,
    // including any added later.
    let probeConsumed = false;
    try {
      return await this.admitInner(request, bodyText, start, key, breakerDecision, () => {
        probeConsumed = true;
      });
    } finally {
      if (!probeConsumed && breakerDecision.probeInFlight) {
        this.circuitBreaker.releaseProbe();
      }
    }
  }

  private async admitInner(
    request: RequestContext,
    bodyText: string | undefined,
    start: number,
    key: string,
    breakerDecision: CircuitBreakerDecision,
    markConsumed: () => void,
  ): Promise<PreflightDecision> {
    if (!breakerDecision.allowed) {
      await this.emit('request.completed', request, breakerDecision.state, 503, start, undefined, undefined, breakerDecision.retryAfterMs);
      return {
        allowed: false,
        statusCode: 503,
        errorCode: 'circuit_open',
        retryAfterMs: breakerDecision.retryAfterMs,
        circuitBreaker: breakerDecision,
      };
    }

    const rateDecision = await this.rateLimiter.allow(key, {
      requestsPerSecond: this.config.rateLimit.requestsPerSecond,
      burst: this.config.rateLimit.burst,
      windowMs: this.config.rateLimit.windowMs,
      remoteRateLimitEndpoint: this.config.rateLimit.remoteRateLimitEndpoint,
      apiKey: this.config.apiKey,
    });

    if (!rateDecision.allowed) {
      const statusCode = rateDecision.degraded ? 503 : 429;
      const errorCode = rateDecision.degraded ? 'rate_limit_unavailable' : 'rate_limit_exceeded';
      await this.emit(rateDecision.degraded ? 'request.completed' : 'request.rate_limited', request, breakerDecision.state, statusCode, start, rateDecision, undefined, rateDecision.retryAfterMs);
      return {
        allowed: false,
        statusCode,
        errorCode,
        retryAfterMs: rateDecision.retryAfterMs,
        rateLimit: rateDecision,
        circuitBreaker: breakerDecision,
      };
    }

    // Agent loop detection + content guardrails inspect the request body.
    // Runs after rate limiting but before token budget reservation, same
    // order as Go's handleHTTP.
    if (bodyText !== undefined) {
      const rejection = this.checkRequestBody(request, bodyText);
      if (rejection) {
        return {
          allowed: false,
          statusCode: rejection.statusCode,
          retryAfterMs: 0,
          rejectionPayload: { error: rejection.error, message: rejection.message },
          rateLimit: rateDecision,
          circuitBreaker: breakerDecision,
        };
      }
    }

    const reservation = this.tokenBudget.reserve(key, this.config.tokenBudget, this.config.estimatedTokensPerRequest);
    const tokenDecision = reservation.decision;
    if (!tokenDecision.allowed) {
      await this.emit('request.token_budget_exceeded', request, breakerDecision.state, 429, start, rateDecision, tokenDecision, tokenDecision.retryAfterMs);
      return {
        allowed: false,
        statusCode: 429,
        errorCode: 'token_budget_exceeded',
        retryAfterMs: tokenDecision.retryAfterMs,
        rateLimit: rateDecision,
        tokenBudget: tokenDecision,
        circuitBreaker: breakerDecision,
      };
    }

    // From here on the caller is responsible for making the actual upstream
    // call and reporting its outcome via observe() (which calls
    // recordOutcome) — that's what will eventually clear a half-open
    // probe. Mark it consumed so admit()'s finally block doesn't also
    // release it.
    markConsumed();

    const allowed: PreflightDecision = {
      allowed: true,
      rateLimit: rateDecision,
      tokenBudget: tokenDecision,
      circuitBreaker: breakerDecision,
    };
    if (reservation.reservationId) {
      allowed.tokenBudgetReservationId = reservation.reservationId;
    }
    return allowed;
  }

  async observe(request: RequestContext, observation: CompletionObservation, startedAtMs: number): Promise<void> {
    const key = this.resolveKey(request);
    void this.circuitBreaker.getState();

    let usage;
    if (observation.snapshot) {
      usage = this.tokenBudget.recordFromSnapshot(key, observation.snapshot, observation.tokenBudgetReservationId);
    } else {
      this.tokenBudget.releaseReservation(key, observation.tokenBudgetReservationId);
    }

    const success = observation.error ? false : observation.statusCode < 500;
    const breakerDecision = this.circuitBreaker.recordOutcome(success);
    if (this.rateLimiter instanceof AdaptiveLimiter) {
      this.rateLimiter.recordOutcome(success);
    }

    const tokenDecision = this.tokenBudget.check(key, this.config.tokenBudget);
    const payload = this.buildPayload(request, breakerDecision.state, observation.statusCode, startedAtMs, undefined, tokenDecision, usage, breakerDecision.retryAfterMs);
    await this.emitEvent('request.completed', request, breakerDecision.state, payload);
  }

  buildPayload(
    request: RequestContext,
    circuitState: CircuitBreakerState,
    statusCode: number,
    startMs: number,
    rateLimit?: { applied: boolean; allowed: boolean; limit: number; remaining: number; retryAfterMs: number },
    tokenBudget?: { applied: boolean; queued: boolean; limit: number; remaining: number; retryAfterMs: number; warning?: boolean },
    usage?: TokenUsage,
    retryAfterMs?: number,
  ): RateGuardEventPayload {
    const latencyMs = Math.max(0, this.config.clock.now() - startMs);
    return {
      request_id: request.requestId,
      method: request.method,
      path: request.path,
      status_code: statusCode,
      latency_ms: latencyMs,
      rate_limit_applied: rateLimit?.applied ?? true,
      rate_limit_allowed: rateLimit?.allowed ?? true,
      rate_limit_limit: rateLimit?.limit ?? this.config.rateLimit.requestsPerSecond,
      rate_limit_remaining: rateLimit?.remaining ?? -1,
      retry_after_ms: retryAfterMs && retryAfterMs > 0 ? retryAfterMs : undefined,
      preset: this.config.preset.name,
      circuit_breaker_state: circuitState,
      queue_depth: 0,
      token_provider: usage?.provider,
      token_model: usage?.model,
      token_input_tokens: usage?.inputTokens,
      token_output_tokens: usage?.outputTokens,
      token_total_tokens: usage?.totalTokens,
      token_budget_mode: this.config.tokenBudget.mode,
      token_budget_applied: tokenBudget?.applied ?? false,
      token_budget_queued: tokenBudget?.queued ?? false,
      token_budget_wait_ms: tokenBudget?.retryAfterMs && tokenBudget.retryAfterMs > 0 ? tokenBudget.retryAfterMs : undefined,
      token_budget_limit: tokenBudget?.limit,
      token_budget_remaining: tokenBudget?.remaining,
    };
  }

  resolveKey(request: RequestContext): string {
    if (this.config.keyFn) {
      const resolved = this.config.keyFn(request).trim();
      if (resolved) {
        return resolved;
      }
    }

    return [request.tenantId, request.routeId, request.upstreamId, request.method].join(':');
  }

  private async emit(
    eventType: RateGuardEventType,
    request: RequestContext,
    breakerState: CircuitBreakerState,
    statusCode: number,
    startMs: number,
    rateLimit?: { applied: boolean; allowed: boolean; limit: number; remaining: number; retryAfterMs: number },
    tokenBudget?: { applied: boolean; queued: boolean; limit: number; remaining: number; retryAfterMs: number; warning?: boolean },
    retryAfterMs?: number,
  ): Promise<void> {
    const payload = this.buildPayload(
      request,
      breakerState,
      statusCode,
      startMs,
      rateLimit,
      tokenBudget,
      undefined,
      retryAfterMs,
    );
    await this.emitEvent(eventType, request, breakerState, payload);
  }

  private async emitEvent(
    eventType: RateGuardEventType,
    request: RequestContext,
    _breakerState: CircuitBreakerState,
    payload: RateGuardEventPayload,
  ): Promise<void> {
    await this.eventEmitter.emit(
      buildEventEnvelope(eventType, payload, {
        tenantId: request.tenantId,
        routeId: request.routeId,
        upstreamId: request.upstreamId,
        traceId: request.traceId,
      }),
    );
  }
}
