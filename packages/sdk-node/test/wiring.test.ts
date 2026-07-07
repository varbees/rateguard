import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { RateGuard } from '../src/index.js';
import { rateguardPlugin } from '../src/adapters/fastify.js';
import { standardGuardrails } from '../src/core/guardrails.js';
import { FakeExpressResponse, FakeFastify, FakeFastifyReply } from './helpers.js';
import type { ExpressLikeRequest } from '../src/adapters/express.js';

describe('IETF RateLimit-* headers', () => {
  it('express: sets RateLimit-Limit/Remaining/Reset on allow, and a matching Reset on deny', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      rateLimit: { requestsPerSecond: 2, burst: 2, windowMs: 60_000 },
    });
    const middleware = guard.middleware();
    const req: ExpressLikeRequest = { method: 'GET', url: '/x', headers: {} };

    const first = new FakeExpressResponse();
    await middleware(req, first, async () => {
      first.status(200).end('ok');
    });
    expect(first.getHeader('X-RateGuard-Limit')).toBe('2');
    expect(first.getHeader('RateLimit-Limit')).toBe('2');
    expect(first.getHeader('RateLimit-Remaining')).toBe('1');
    expect(first.getHeader('RateLimit-Reset')).toBe('0');

    const second = new FakeExpressResponse();
    await middleware(req, second, async () => {
      second.status(200).end('ok');
    });
    expect(second.getHeader('RateLimit-Remaining')).toBe('0');

    const third = new FakeExpressResponse();
    await middleware(req, third, async () => {
      throw new Error('next should not run once the bucket is exhausted');
    });
    expect(third.statusCode).toBe(429);
    expect(third.getHeader('RateLimit-Limit')).toBe('2');
    expect(third.getHeader('RateLimit-Remaining')).toBe('0');
    const resetSeconds = Number(third.getHeader('RateLimit-Reset'));
    expect(resetSeconds).toBeGreaterThan(0);
    // Same whole-second ceiling as Retry-After.
    expect(String(resetSeconds)).toBe(third.getHeader('Retry-After'));
  });

  it('fastify: sets RateLimit-* headers on allow and deny', async () => {
    const fastify = new FakeFastify();
    await rateguardPlugin(fastify, {
      preset: 'dev',
      rateLimit: { requestsPerSecond: 1, burst: 1, windowMs: 60_000 },
    });

    const request = { method: 'GET', url: '/x', headers: {} };

    const reply1 = new FakeFastifyReply();
    await fastify.hooks.onRequest[0]!(request, reply1);
    expect(reply1.headers['X-RateGuard-Limit']).toBe('1');
    expect(reply1.headers['RateLimit-Limit']).toBe('1');
    expect(reply1.headers['RateLimit-Remaining']).toBe('0');
    expect(reply1.headers['RateLimit-Reset']).toBe('0');

    const reply2 = new FakeFastifyReply();
    await fastify.hooks.onRequest[0]!(request, reply2);
    expect(reply2.statusCode).toBe(429);
    expect(reply2.headers['RateLimit-Remaining']).toBe('0');
    expect(Number(reply2.headers['RateLimit-Reset'])).toBeGreaterThan(0);
  });

  it('does not set RateLimit-* headers when the rate limiter is disabled (not applied)', async () => {
    const guard = new RateGuard({ preset: 'dev', rateLimit: { requestsPerSecond: 0, burst: 0 } });
    const middleware = guard.middleware();
    const res = new FakeExpressResponse();
    await middleware({ method: 'GET', url: '/x', headers: {} }, res, async () => {
      res.status(200).end('ok');
    });
    expect(res.getHeader('RateLimit-Limit')).toBeUndefined();
    expect(res.getHeader('RateLimit-Remaining')).toBeUndefined();
    expect(res.getHeader('RateLimit-Reset')).toBeUndefined();
  });
});

describe('loop detection wiring', () => {
  it('429s with loop_detected when a fingerprint repeats at a higher X-Sequence-Depth', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      loopDetection: true,
      rateLimit: { requestsPerSecond: 100, burst: 100 },
    });
    const middleware = guard.middleware();
    let nextCalled = 0;

    const first: ExpressLikeRequest = { method: 'POST', url: '/agent', headers: { 'x-sequence-depth': '1' } };
    const firstRes = new FakeExpressResponse();
    await middleware(first, firstRes, async () => {
      nextCalled += 1;
      firstRes.status(200).end('ok');
    });
    expect(firstRes.statusCode).toBe(200);
    expect(nextCalled).toBe(1);

    const second: ExpressLikeRequest = { method: 'POST', url: '/agent', headers: { 'x-sequence-depth': '2' } };
    const secondRes = new FakeExpressResponse();
    await middleware(second, secondRes, async () => {
      nextCalled += 1;
      secondRes.status(200).end('ok');
    });

    expect(nextCalled).toBe(1); // handler must NOT run for the rejected request
    expect(secondRes.statusCode).toBe(429);
    const body = JSON.parse(secondRes.body()) as { error: string; message: string };
    expect(body.error).toBe('loop_detected');
    expect(body.message).toContain('loop detected');
  });

  it('does not trigger loop detection when the X-Sequence-Depth header is absent', async () => {
    const guard = new RateGuard({ preset: 'dev', loopDetection: true, rateLimit: { requestsPerSecond: 100, burst: 100 } });
    const middleware = guard.middleware();
    let nextCalled = 0;
    const req: ExpressLikeRequest = { method: 'POST', url: '/agent', headers: {} };

    for (let i = 0; i < 2; i += 1) {
      const res = new FakeExpressResponse();
      await middleware(req, res, async () => {
        nextCalled += 1;
        res.status(200).end('ok');
      });
      expect(res.statusCode).toBe(200);
    }
    expect(nextCalled).toBe(2);
  });

  it('does not trigger loop detection when loopDetection option is false, even with the header present', async () => {
    const guard = new RateGuard({ preset: 'dev', rateLimit: { requestsPerSecond: 100, burst: 100 } });
    const middleware = guard.middleware();
    let nextCalled = 0;

    for (const depth of ['1', '99']) {
      const req: ExpressLikeRequest = { method: 'POST', url: '/agent', headers: { 'x-sequence-depth': depth } };
      const res = new FakeExpressResponse();
      await middleware(req, res, async () => {
        nextCalled += 1;
        res.status(200).end('ok');
      });
      expect(res.statusCode).toBe(200);
    }
    expect(nextCalled).toBe(2);
  });
});

describe('guardrails wiring', () => {
  it('422s a body that violates a configured guardrail, and does not call the handler', async () => {
    const guard = new RateGuard({ preset: 'dev', guardrails: standardGuardrails() });
    const middleware = guard.middleware();

    const body = 'my email is attacker@example.com please respond';
    const req = Object.assign(Readable.from([Buffer.from(body)]), {
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
    }) as unknown as ExpressLikeRequest;

    let nextCalled = false;
    const res = new FakeExpressResponse();
    await middleware(req, res, async () => {
      nextCalled = true;
      res.status(200).end('ok');
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body()) as { error: string; message: string };
    expect(parsed.error).toBe('pii_detected');
  });

  it('allows a clean body through to the handler', async () => {
    const guard = new RateGuard({ preset: 'dev', guardrails: standardGuardrails() });
    const middleware = guard.middleware();

    const req = Object.assign(Readable.from([Buffer.from('what is the weather today')]), {
      method: 'POST',
      url: '/chat',
      headers: {},
    }) as unknown as ExpressLikeRequest;

    let nextCalled = false;
    const res = new FakeExpressResponse();
    await middleware(req, res, async () => {
      nextCalled = true;
      res.status(200).end('ok');
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('does not check GET/HEAD requests even with guardrails configured', async () => {
    const guard = new RateGuard({ preset: 'dev', guardrails: standardGuardrails() });
    const middleware = guard.middleware();

    const req: ExpressLikeRequest = { method: 'GET', url: '/chat', headers: {} };
    let nextCalled = false;
    const res = new FakeExpressResponse();
    await middleware(req, res, async () => {
      nextCalled = true;
      res.status(200).end('ok');
    });

    expect(nextCalled).toBe(true);
  });

  it('records violations to the guardrail log and surfaces stats through list_limits', async () => {
    const guard = new RateGuard({ preset: 'dev', guardrails: standardGuardrails() });
    const middleware = guard.middleware();

    const req = Object.assign(Readable.from([Buffer.from('contact me at attacker@example.com')]), {
      method: 'POST',
      url: '/chat',
      headers: {},
    }) as unknown as ExpressLikeRequest;

    const res = new FakeExpressResponse();
    await middleware(req, res, async () => {
      res.status(200).end('ok');
    });
    expect(res.statusCode).toBe(422);

    const result = await guard.mcpCall('list_limits', { key: 'agent-1' });
    const parsed = JSON.parse(result.content[0]!.text) as {
      guardrails: { enabled: boolean; total: number; by_code: Record<string, number>; recent: Array<{ code: string }> };
    };
    expect(parsed.guardrails.enabled).toBe(true);
    expect(parsed.guardrails.total).toBe(1);
    expect(parsed.guardrails.by_code.pii_detected).toBe(1);
    expect(parsed.guardrails.recent).toHaveLength(1);
    expect(parsed.guardrails.recent[0]?.code).toBe('pii_detected');
  });

  it('reports guardrails as disabled through list_limits when no guardrails are configured', async () => {
    const guard = new RateGuard({ preset: 'dev' });
    const result = await guard.mcpCall('list_limits', { key: 'agent-1' });
    const parsed = JSON.parse(result.content[0]!.text) as { guardrails: { enabled: boolean } };
    expect(parsed.guardrails.enabled).toBe(false);
  });
});

describe('circuit breaker half-open probe leak (regression)', () => {
  it('does not wedge in half-open forever when the recovery probe is denied by a guardrail', async () => {
    let now = 0;
    const clock = { now: () => now };
    const guard = new RateGuard({
      preset: 'dev',
      clock,
      rateLimit: { requestsPerSecond: 1_000, burst: 1_000 },
      guardrails: standardGuardrails(),
      circuitBreaker: {
        errorRateThreshold: 0.5,
        openTimeoutMs: 60_000,
        halfOpenSuccessesRequired: 1,
        sampleSize: 1,
      },
    });
    const middleware = guard.middleware();

    const post = (body: string) =>
      Object.assign(Readable.from([Buffer.from(body)]), {
        method: 'POST',
        url: '/chat',
        headers: {},
      }) as unknown as ExpressLikeRequest;

    let upstreamCalls = 0;

    // Trip the breaker open with a clean request that fails upstream.
    const tripped = new FakeExpressResponse();
    await middleware(post('summarize this document'), tripped, async () => {
      upstreamCalls += 1;
      tripped.status(500).end('upstream error');
    });
    expect(tripped.statusCode).toBe(500);

    now += 61_000;

    // This request claims the half-open probe, then gets denied by the
    // guardrail before it ever reaches upstream — observe() never runs.
    const blocked = new FakeExpressResponse();
    await middleware(post('email me at attacker@example.com'), blocked, async () => {
      upstreamCalls += 1;
      blocked.status(200).end('should not reach here');
    });
    expect(blocked.statusCode).toBe(422);

    // The bug: without releasing the probe, every request from here on
    // would see the breaker permanently wedged in half-open and never
    // reach upstream again, no matter how much time passes.
    const recovered = new FakeExpressResponse();
    await middleware(post('what is the weather today'), recovered, async () => {
      upstreamCalls += 1;
      recovered.status(200).end('ok');
    });
    expect(recovered.statusCode).not.toBe(503);
    expect(upstreamCalls).toBe(2);
  });
});

describe('estimatedTokensPerRequest wiring', () => {
  it('threads through admit() so two same-key requests can both reserve budget', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      tokenBudget: { monthLimit: 100, mode: 'hard-stop', softStopAt: 0.8 },
      estimatedTokensPerRequest: 10,
    });

    const request = {
      method: 'GET',
      path: '/x',
      headers: {},
      requestId: 'r1',
      traceId: 't1',
      tenantId: 'global',
      routeId: 'root',
      upstreamId: 'local',
      provider: undefined,
      model: undefined,
    };

    const first = await guard.runtime.admit(request);
    expect(first.allowed).toBe(true);
    expect(first.tokenBudget?.remaining).toBe(90);

    const second = await guard.runtime.admit(request);
    expect(second.allowed).toBe(true);
    expect(second.tokenBudget?.remaining).toBe(80);
  });

  it('without estimatedTokensPerRequest, a concurrent same-key request is serialized (old behavior)', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      tokenBudget: { monthLimit: 100, mode: 'hard-stop', softStopAt: 0.8 },
    });

    const request = {
      method: 'GET',
      path: '/x',
      headers: {},
      requestId: 'r1',
      traceId: 't1',
      tenantId: 'global',
      routeId: 'root',
      upstreamId: 'local',
      provider: undefined,
      model: undefined,
    };

    const first = await guard.runtime.admit(request);
    expect(first.allowed).toBe(true);

    const second = await guard.runtime.admit(request);
    expect(second.allowed).toBe(false);
    expect(second.errorCode).toBe('token_budget_exceeded');
  });
});
