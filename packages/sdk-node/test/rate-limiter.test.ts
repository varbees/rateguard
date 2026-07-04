import { describe, expect, it, vi } from 'vitest';
import { RateGuard } from '../src/index.js';
import { RateLimiter } from '../src/core/rate-limiter.js';

const clock = {
  now: () => 1_000,
};

describe('RateLimiter', () => {
  it('allows under the limit and denies when exceeded (token bucket)', async () => {
    const limiter = new RateLimiter({ clock, capacity: 50_000 });
    const options = {
      requestsPerSecond: 1,
      burst: 1,
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

  it('fails closed when a configured remote limiter cannot be reached', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('remote down'));
    try {
      const limiter = new RateLimiter({ clock, capacity: 50_000 });

      const decision = await limiter.allow('tenant:route:upstream:GET', {
        requestsPerSecond: 100,
        burst: 100,
        windowMs: 60_000,
        remoteRateLimitEndpoint: 'https://control.example/api/v1/ratelimit',
        apiKey: 'test',
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(decision.allowed).toBe(false);
      expect(decision.applied).toBe(false);
      expect(decision.degraded).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('reports remote limiter failures as a user-facing 503 admission denial', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('remote down'));
    try {
      const guard = new RateGuard({
        preset: 'dev',
        rateLimit: {
          requestsPerSecond: 100,
          burst: 100,
          remoteRateLimitEndpoint: 'https://control.example/api/v1/ratelimit',
        },
      });

      const decision = await guard.runtime.admit({
        method: 'GET',
        path: '/hello',
        headers: {},
        requestId: 'req-1',
        traceId: 'trace-1',
        tenantId: 'global',
        routeId: 'root',
        upstreamId: 'local',
        provider: undefined,
        model: undefined,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.statusCode).toBe(503);
      expect(decision.errorCode).toBe('rate_limit_unavailable');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
