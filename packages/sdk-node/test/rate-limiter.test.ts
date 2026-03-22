import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/core/rate-limiter.js';

const clock = {
  now: () => 1_000,
};

describe('RateLimiter', () => {
  it('allows under the local limit and denies when exceeded', async () => {
    const limiter = new RateLimiter({ clock, capacity: 50_000 });
    const options = {
      requestsPerSecond: 1,
      burst: 0,
      windowMs: 60_000,
      remoteRateLimitEndpoint: '',
      apiKey: 'test',
    };

    const first = await limiter.allow('tenant:route:upstream:GET', options);
    const second = await limiter.allow('tenant:route:upstream:GET', options);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(0);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });
});
