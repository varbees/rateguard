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
    this.windowSize = options.sampleSize;
    this.errorRateThreshold = options.errorRateThreshold;
    this.openTimeoutMs = options.openTimeoutMs;
    this.halfOpenSuccessesRequired = options.halfOpenSuccessesRequired;
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
          this.state = 'closed';
          this.consecutiveHalfOpenSuccesses = 0;
          this.probeInFlight = false;
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

  private open(): void {
    this.state = 'open';
    this.openedAtMs = this.clock.now();
    this.probeInFlight = false;
    this.consecutiveHalfOpenSuccesses = 0;
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
