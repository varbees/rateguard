import {
  createEventEmitter,
  buildEventEnvelope,
} from './core/event-emitter.js';
import { CircuitBreaker } from './core/circuit-breaker.js';
import { RateLimiter } from './core/rate-limiter.js';
import { TokenBudgetManager } from './core/token-budget.js';
import { LoopDetector } from './core/mcp.js';
import { GuardrailLog } from './core/guardrail-log.js';
import { readFirstHeader } from './core/utils.js';
import { resolveRateGuardOptions, systemClock } from './config.js';
import {
  type CompletionObservation,
  type CircuitBreakerState,
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
  readonly rateLimiter: RateLimiter;
  readonly tokenBudget: TokenBudgetManager;
  readonly circuitBreaker: CircuitBreaker;
  readonly eventEmitter: ReturnType<typeof createEventEmitter>;
  readonly loopDetector: LoopDetector;
  readonly guardrailLog: GuardrailLog;

  constructor(options: RateGuardOptions = {}) {
    this.config = resolveRateGuardOptions(options);
    this.rateLimiter = new RateLimiter({ clock: this.config.clock, capacity: 50_000 });
    this.tokenBudget = new TokenBudgetManager({ clock: this.config.clock, capacity: 50_000 });
    this.circuitBreaker = new CircuitBreaker(this.config.clock, this.config.circuitBreaker);
    this.eventEmitter = createEventEmitter(this.config);
    this.loopDetector = new LoopDetector();
    this.guardrailLog = new GuardrailLog();
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
