import type { CircuitBreakerDecision, CircuitBreakerOptions, CircuitBreakerState, Clock } from '../types.js';

interface OutcomeRing {
  values: boolean[];
  head: number;
  total: number;
  failures: number;
}

/**
 * Rolling-window circuit breaker.
 */
export class CircuitBreaker {
  private readonly clock: Clock;
  private readonly windowSize: number;
  private readonly errorRateThreshold: number;
  private readonly openTimeoutMs: number;
  private readonly halfOpenSuccessesRequired: number;
  private readonly minSamplesToTrip: number;
  private state: CircuitBreakerState = 'closed';
  private openedAtMs = 0;
  private probeInFlight = false;
  private consecutiveHalfOpenSuccesses = 0;
  private readonly ring: OutcomeRing;

  constructor(clock: Clock, options: Required<CircuitBreakerOptions>) {
    this.clock = clock;
    this.windowSize = positiveInteger(options.sampleSize, 100);
    this.errorRateThreshold = options.errorRateThreshold > 0 && options.errorRateThreshold <= 1 ? options.errorRateThreshold : 0.5;
    this.openTimeoutMs = positiveInteger(options.openTimeoutMs, 60_000);
    this.halfOpenSuccessesRequired = positiveInteger(options.halfOpenSuccessesRequired, 2);
    this.minSamplesToTrip = Math.min(10, this.windowSize);
    this.ring = {
      values: new Array<boolean>(this.windowSize).fill(false),
      head: 0,
      total: 0,
      failures: 0,
    };
  }

  getState(): CircuitBreakerState {
    if (this.state === 'open' && this.clock.now() - this.openedAtMs >= this.openTimeoutMs) {
      this.state = 'half-open';
      this.probeInFlight = false;
      this.consecutiveHalfOpenSuccesses = 0;
    }
    return this.state;
  }

  allow(): CircuitBreakerDecision {
    const state = this.getState();
    if (state === 'open') {
      return {
        allowed: false,
        state,
        retryAfterMs: Math.max(1, this.openTimeoutMs - (this.clock.now() - this.openedAtMs)),
        probeInFlight: false,
      };
    }

    if (state === 'half-open') {
      if (this.probeInFlight) {
        return {
          allowed: false,
          state,
          retryAfterMs: this.openTimeoutMs,
          probeInFlight: true,
        };
      }
      this.probeInFlight = true;
      return {
        allowed: true,
        state,
        retryAfterMs: 0,
        probeInFlight: true,
      };
    }

    return {
      allowed: true,
      state: 'closed',
      retryAfterMs: 0,
      probeInFlight: false,
    };
  }

  recordOutcome(success: boolean): CircuitBreakerDecision {
    this.pushOutcome(!success);
    const state = this.getState();

    if (state === 'half-open') {
      if (success) {
        this.consecutiveHalfOpenSuccesses += 1;
        this.probeInFlight = false;
        if (this.consecutiveHalfOpenSuccesses >= this.halfOpenSuccessesRequired) {
          this.close();
        }
      } else {
        this.open();
      }
    } else if (state === 'closed') {
      const sampleCount = Math.max(1, this.ring.total);
      const errorRate = this.ring.failures / sampleCount;
      if (sampleCount >= this.minSamplesToTrip && errorRate > this.errorRateThreshold) {
        this.open();
      }
    }

    return {
      allowed: this.state !== 'open',
      state: this.state,
      retryAfterMs: this.state === 'open' ? this.openTimeoutMs : 0,
      probeInFlight: this.probeInFlight,
    };
  }

  /**
   * Clears an in-flight half-open probe WITHOUT recording a success or
   * failure outcome. Use this when a request that allow() granted the
   * probe slot to never actually reached upstream — denied instead by an
   * earlier, unrelated gate (rate limit, guardrail, token budget). That
   * request tested nothing about upstream health, so counting it as
   * either a success or a failure via recordOutcome would corrupt the
   * breaker's signal. Without this, the probe slot leaks forever: allow()
   * never grants another one while probeInFlight is stuck true, so the
   * breaker is wedged in half-open, denying every request, until the
   * process restarts.
   */
  releaseProbe(): void {
    if (this.state === 'half-open') {
      this.probeInFlight = false;
    }
  }

  private open(): void {
    this.state = 'open';
    this.openedAtMs = this.clock.now();
    this.probeInFlight = false;
    this.consecutiveHalfOpenSuccesses = 0;
  }

  private close(): void {
    this.state = 'closed';
    this.probeInFlight = false;
    this.consecutiveHalfOpenSuccesses = 0;
    this.ring.values.fill(false);
    this.ring.head = 0;
    this.ring.total = 0;
    this.ring.failures = 0;
  }

  private pushOutcome(failed: boolean): void {
    const outgoing = this.ring.values[this.ring.head];
    if (this.ring.total >= this.windowSize && outgoing) {
      this.ring.failures -= 1;
    }

    this.ring.values[this.ring.head] = failed;
    if (failed) {
      this.ring.failures += 1;
    }

    this.ring.head = (this.ring.head + 1) % this.windowSize;
    this.ring.total = Math.min(this.ring.total + 1, this.windowSize);
  }
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
