import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/core/rate-limiter.js';
import { ShardedLimiter } from '../src/core/sharded-limiter.js';

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

describe('ShardedLimiter decision parity with RateLimiter', () => {
  it('produces the identical (allowed, remaining, retryAfterMs) sequence for the same admission sequence', () => {
    const a = fakeClock(1_000);
    const b = fakeClock(1_000);
    const rateLimiter = new RateLimiter({ clock: a.clock, capacity: 1_000 });
    const shardedLimiter = new ShardedLimiter({ clock: b.clock });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 5 };
    const key = 'parity-key';

    const sequence: Array<{ advanceMs: number; n: number }> = [
      { advanceMs: 0, n: 3 },
      { advanceMs: 0, n: 3 }, // deny, only 2 left
      { advanceMs: 0, n: 2 }, // drains it
      { advanceMs: 0, n: 1 }, // deny, empty
      { advanceMs: 250, n: 1 }, // partial refill: 0.25s * 10rps = 2.5 tokens
      { advanceMs: 100, n: 1 },
      { advanceMs: 700_000, n: 1 }, // long idle -> refills to full by construction either way
      { advanceMs: 0, n: 4 }, // drains it again
      { advanceMs: 0, n: 15 }, // large deficit -> exercises whole-second ceil rounding
    ];

    for (const [i, step] of sequence.entries()) {
      a.advance(step.advanceMs);
      b.advance(step.advanceMs);
      const expected = rateLimiter.increment(key, options, step.n);
      const actual = shardedLimiter.increment(key, options, step.n);
      expect(actual.allowed, `step ${i}`).toBe(expected.allowed);
      expect(actual.remaining, `step ${i}`).toBe(expected.remaining);
      expect(actual.retryAfterMs, `step ${i}`).toBe(expected.retryAfterMs);
      expect(actual.limit, `step ${i}`).toBe(expected.limit);
    }
  });

  it('peek() never consumes and never creates state for an unseen key', () => {
    const { clock } = fakeClock(0);
    const limiter = new ShardedLimiter({ clock });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 4 };
    const key = 'peek-key';

    const before = limiter.peek(key, options);
    expect(before.allowed).toBe(true);
    expect(before.remaining).toBe(4);

    for (let i = 0; i < 5; i++) {
      limiter.peek(key, options);
    }
    expect(limiter.get(key, options).tokens).toBe(4); // still full — peek never wrote state

    limiter.increment(key, options, 1);
    expect(limiter.get(key, options).tokens).toBeLessThan(4);
  });

  it('get() reports current tokens without consuming, matching RateLimiter', () => {
    const a = fakeClock(0);
    const b = fakeClock(0);
    const rateLimiter = new RateLimiter({ clock: a.clock, capacity: 1_000 });
    const shardedLimiter = new ShardedLimiter({ clock: b.clock });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 5 };
    const key = 'get-key';

    rateLimiter.increment(key, options, 5);
    shardedLimiter.increment(key, options, 5);
    expect(shardedLimiter.get(key, options).tokens).toBeCloseTo(rateLimiter.get(key, options).tokens, 10);

    a.advance(500);
    b.advance(500);
    expect(shardedLimiter.get(key, options).tokens).toBeCloseTo(rateLimiter.get(key, options).tokens, 5);
    expect(shardedLimiter.get(key, options).tokens).toBeCloseTo(5, 5); // 0.5s * 10rps = 5 tokens refilled
  });

  it('reset() refills the bucket to full', () => {
    const { clock } = fakeClock(0);
    const limiter = new ShardedLimiter({ clock });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 2 };
    const key = 'reset-key';

    limiter.increment(key, options, 2);
    const drained = limiter.increment(key, options, 1);
    expect(drained.allowed).toBe(false);

    limiter.reset(key);

    const afterReset = limiter.increment(key, options, 1);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(1);
  });

  it('a disabled policy (rps<=0 or burst<=0) is never applied, matching RateLimiter', () => {
    const { clock } = fakeClock(0);
    const limiter = new ShardedLimiter({ clock });
    const options = { ...baseOptions, requestsPerSecond: 0, burst: 0 };

    const decision = limiter.allow('any-key', options);
    expect(decision.applied).toBe(false);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(-1);
    expect(decision.limit).toBe(-1);
  });
});
