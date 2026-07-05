import { describe, expect, it } from 'vitest';
import { AdaptiveLimiter } from '../src/core/adaptive.js';
import { RateLimiter } from '../src/core/rate-limiter.js';

function fakeClock(startMs: number) {
  let now = startMs;
  return {
    clock: { now: () => now },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const baseOptions = {
  windowMs: 60_000,
  remoteRateLimitEndpoint: '',
  apiKey: undefined as string | undefined,
};

describe('AdaptiveLimiter', () => {
  it('starts unscaled: factor 1.0, error rate 0', () => {
    const { clock } = fakeClock(0);
    const inner = new RateLimiter({ clock, capacity: 1_000 });
    const adaptive = new AdaptiveLimiter(inner, undefined, clock);

    expect(adaptive.factor()).toBe(1.0);
    expect(adaptive.errorRate()).toBe(0);
  });

  it('shrinks the effective rate after a run of failures', () => {
    const { clock, advance } = fakeClock(0);
    const inner = new RateLimiter({ clock, capacity: 1_000 });
    const adaptive = new AdaptiveLimiter(inner, { adjustIntervalMs: 1_000 }, clock);

    for (let i = 0; i < 5; i++) {
      adaptive.recordOutcome(false);
      advance(1_100); // clear the adjust interval every time
    }

    expect(adaptive.errorRate()).toBeGreaterThan(0);
    expect(adaptive.factor()).toBeLessThan(1.0);
    // Default minFactor is 0.25 — two decreases (1.0*0.5, then 0.5*0.5) already floor there.
    expect(adaptive.factor()).toBeCloseTo(0.25, 10);
  });

  it('grows the effective rate back after a run of successes', () => {
    const { clock, advance } = fakeClock(0);
    const inner = new RateLimiter({ clock, capacity: 1_000 });
    const adaptive = new AdaptiveLimiter(inner, { adjustIntervalMs: 1_000 }, clock);

    for (let i = 0; i < 5; i++) {
      adaptive.recordOutcome(false);
      advance(1_100);
    }
    const shrunkFactor = adaptive.factor();
    expect(shrunkFactor).toBeLessThan(1.0);

    for (let i = 0; i < 40; i++) {
      adaptive.recordOutcome(true);
      advance(1_100);
    }

    expect(adaptive.factor()).toBeGreaterThan(shrunkFactor);
  });

  it('does not adjust more than once per adjustIntervalMs', () => {
    const { clock, advance } = fakeClock(0);
    const inner = new RateLimiter({ clock, capacity: 1_000 });
    const adaptive = new AdaptiveLimiter(inner, { adjustIntervalMs: 1_000 }, clock);

    adaptive.recordOutcome(false); // first sample always adjusts (factor -> 0.5)
    expect(adaptive.factor()).toBeCloseTo(0.5, 10);

    advance(10); // well under the adjust interval
    adaptive.recordOutcome(false);
    expect(adaptive.factor()).toBeCloseTo(0.5, 10); // unchanged — no adjust yet

    advance(1_000);
    adaptive.recordOutcome(false);
    expect(adaptive.factor()).toBeLessThan(0.5); // interval cleared — adjusts again
  });

  it('peek() reflects the same scaled policy as allow(), without consuming', async () => {
    const { clock, advance } = fakeClock(0);
    const inner = new RateLimiter({ clock, capacity: 1_000 });
    const adaptive = new AdaptiveLimiter(inner, { adjustIntervalMs: 1_000, decreaseFactor: 0.5 }, clock);

    adaptive.recordOutcome(false);
    advance(1_100);
    adaptive.recordOutcome(false);
    const factor = adaptive.factor();
    expect(factor).toBeLessThan(1.0);

    const options = { ...baseOptions, requestsPerSecond: 100, burst: 100 };
    const scaledBurst = Math.max(1, Math.round(100 * factor));
    const scaledRps = Math.max(1, Math.round(100 * factor));

    const peeked = adaptive.peek('fresh-key', options);
    expect(peeked.remaining).toBe(scaledBurst);
    expect(peeked.limit).toBe(scaledRps);

    const allowed = await adaptive.allow('fresh-key', options);
    expect(allowed.limit).toBe(scaledRps);
    expect(allowed.remaining).toBe(scaledBurst - 1);

    // peek still reports the pre-consumption remaining for a second key —
    // proves peek used the identical scaled policy, it just didn't consume.
    const peekedAgain = adaptive.peek('another-fresh-key', options);
    expect(peekedAgain.remaining).toBe(scaledBurst);
  });

  it('leaves the policy unscaled once the factor returns to 1.0', () => {
    const { clock } = fakeClock(0);
    const inner = new RateLimiter({ clock, capacity: 1_000 });
    const adaptive = new AdaptiveLimiter(inner, undefined, clock);

    const options = { ...baseOptions, requestsPerSecond: 50, burst: 50 };
    const decision = adaptive.peek('k', options);
    expect(decision.limit).toBe(50);
    expect(decision.remaining).toBe(50);
  });
});
