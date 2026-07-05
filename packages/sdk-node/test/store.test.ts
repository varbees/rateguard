import { describe, expect, it } from 'vitest';
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

describe('RateLimiter Store primitives', () => {
  it('increment(key, options, 1) matches allow()', async () => {
    const { clock } = fakeClock(1_000);
    const limiter = new RateLimiter({ clock, capacity: 1_000 });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 3 };

    const allowed = await limiter.allow('k-allow', options);
    const incremented = limiter.increment('k-inc', options, 1);

    expect(incremented.allowed).toBe(allowed.allowed);
    expect(incremented.remaining).toBe(allowed.remaining);
  });

  it('increment(key, options, n) consumes n tokens atomically', () => {
    const { clock } = fakeClock(1_000);
    const limiter = new RateLimiter({ clock, capacity: 1_000 });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 5 };
    const key = 'k';

    const first = limiter.increment(key, options, 3);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    const second = limiter.increment(key, options, 3);
    expect(second.allowed).toBe(false);

    const third = limiter.increment(key, options, 2);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('get() never consumes tokens', () => {
    const { clock } = fakeClock(1_000);
    const limiter = new RateLimiter({ clock, capacity: 1_000 });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 4 };
    const key = 'k';

    const before = limiter.get(key, options);
    expect(before.tokens).toBe(4);

    for (let i = 0; i < 5; i++) {
      limiter.get(key, options);
    }
    const after = limiter.get(key, options);
    expect(after.tokens).toBe(before.tokens);

    limiter.increment(key, options, 1);
    const afterConsume = limiter.get(key, options);
    expect(afterConsume.tokens).toBeLessThan(before.tokens);
  });

  it('reset() refills the bucket to full', () => {
    const { clock } = fakeClock(1_000);
    const limiter = new RateLimiter({ clock, capacity: 1_000 });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 2 };
    const key = 'k';

    limiter.increment(key, options, 1);
    limiter.increment(key, options, 1);
    const drained = limiter.increment(key, options, 1);
    expect(drained.allowed).toBe(false);

    limiter.reset(key);

    const afterReset = limiter.increment(key, options, 1);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(1);
  });

  it('refills over time exactly like allow()', () => {
    const { clock, advance } = fakeClock(1_000);
    const limiter = new RateLimiter({ clock, capacity: 1_000 });
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 5 };
    const key = 'k';

    limiter.increment(key, options, 5);
    expect(limiter.get(key, options).tokens).toBe(0);

    advance(500); // 0.5s * 10 rps = 5 tokens refilled
    expect(limiter.get(key, options).tokens).toBeCloseTo(5, 5);
  });
});
