/**
 * Adaptive rate limiting — Node port of Go's AdaptiveLimiter
 * (packages/sdk-go/adaptive.go). Pure control-loop algorithm, no
 * language-specific concerns: an AIMD (additive-increase /
 * multiplicative-decrease) controller wrapping any limiter, the same
 * control shape TCP congestion control uses.
 *
 * Static rate limits are provably suboptimal under shifting traffic
 * (arXiv:2511.03279); the fix does not need ML — an EMA of the observed
 * upstream error rate driving an AIMD controller captures the result:
 *
 *   - healthy upstream  → limits grow additively toward maxFactor × policy
 *   - error rate above target → limits cut multiplicatively toward
 *     minFactor × policy
 *   - the cut triggers at 80% of the target error rate — predictive, so the
 *     limiter sheds load *before* the circuit breaker has to trip
 *
 * `peek()` scales identically to `allow()`, so agent pre-flight answers
 * (MCP tools, dashboards) stay honest while adaptation moves the limit.
 *
 * Source: AIMD congestion control —
 * https://en.wikipedia.org/wiki/Additive_increase/multiplicative_decrease
 */

import type { AdaptiveOptions, Clock, RateLimitDecision, RateLimitOptions } from '../types.js';
import { normalizeAdaptiveOptions } from '../config.js';
import type { RateLimiterLike } from './rate-limiter.js';

/**
 * Wraps any `RateLimiterLike` and auto-tunes the effective policy from
 * observed upstream outcomes instead of trusting a static config forever.
 */
export class AdaptiveLimiter implements RateLimiterLike {
  private readonly inner: RateLimiterLike;
  private readonly opts: Required<AdaptiveOptions>;
  private readonly clock: Clock;

  private factorValue = 1.0;
  private errorEMA = 0;
  private sampled = false;
  // -Infinity mirrors Go's zero-value time.Time{}: astronomically far in the
  // past, so the very first RecordOutcome call always triggers an
  // adjustment regardless of what a fake test clock happens to start at.
  private lastAdjustAt = -Infinity;

  constructor(inner: RateLimiterLike, opts: AdaptiveOptions | undefined, clock: Clock) {
    this.inner = inner;
    this.opts = normalizeAdaptiveOptions(opts);
    this.clock = clock;
  }

  /** Current policy scaling factor (1.0 = configured policy, unscaled). */
  factor(): number {
    return this.factorValue;
  }

  /** Current EMA of upstream failures (0-1). */
  errorRate(): number {
    return this.errorEMA;
  }

  /**
   * Feeds one upstream outcome (success = HTTP status < 500) into the
   * controller. Call this from the same signal already fed to the circuit
   * breaker — see RateGuardRuntime.observe().
   */
  recordOutcome(success: boolean): void {
    const now = this.clock.now();
    const sample = success ? 0 : 1;

    if (!this.sampled) {
      this.errorEMA = sample;
      this.sampled = true;
    } else {
      this.errorEMA = this.opts.emaAlpha * sample + (1 - this.opts.emaAlpha) * this.errorEMA;
    }

    if (now - this.lastAdjustAt < this.opts.adjustIntervalMs) {
      return;
    }
    this.lastAdjustAt = now;

    // Predictive: act at 80% of the target so the breaker rarely has to.
    if (this.errorEMA >= 0.8 * this.opts.targetErrorRate) {
      this.factorValue = Math.max(this.opts.minFactor, this.factorValue * this.opts.decreaseFactor);
    } else {
      this.factorValue = Math.min(this.opts.maxFactor, this.factorValue + this.opts.increaseStep);
    }
  }

  private scaled<T extends Required<RateLimitOptions>>(options: T): T {
    const factor = this.factorValue;
    if (factor === 1.0 || options.requestsPerSecond <= 0 || options.burst <= 0) {
      return options;
    }

    let scaledRps = Math.round(options.requestsPerSecond * factor);
    let scaledBurst = Math.round(options.burst * factor);
    if (scaledRps < 1) scaledRps = 1;
    if (scaledBurst < 1) scaledBurst = 1;

    return { ...options, requestsPerSecond: scaledRps, burst: scaledBurst };
  }

  allow(
    key: string,
    options: Required<RateLimitOptions> & { apiKey: string | undefined },
  ): Promise<RateLimitDecision> | RateLimitDecision {
    return this.inner.allow(key, this.scaled(options));
  }

  peek(key: string, options: Required<RateLimitOptions>): RateLimitDecision {
    // AdaptiveLimiter's `inner` is always an in-process limiter in current
    // wiring (RateGuardRuntime never composes it with RedisGCRALimiter — see
    // redis-limiter.ts), so this cast reflects the actual runtime contract.
    // The cast exists purely because RateLimiterLike.peek's return type was
    // widened to accommodate Redis's genuinely-async peek; it does not change
    // behavior here.
    return this.inner.peek(key, this.scaled(options)) as RateLimitDecision;
  }
}
