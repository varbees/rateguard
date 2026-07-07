import { describe, expect, it } from 'vitest';
import { RateGuard, ShardedLimiter, AdaptiveLimiter, SemanticCache, type Embedder, type GenAISpan } from '../src/index.js';
import type { RequestContext } from '../src/types.js';

/**
 * Rule 9 ("a feature isn't done until it's wired"): these tests drive the
 * PUBLIC RateGuard surface — not the internal classes directly — proving
 * adaptiveRateLimit and startGenAICall are reachable the way a real caller
 * would reach them, not just importable from a deep path.
 */

function fakeClock(startMs: number) {
  let now = startMs;
  return {
    clock: { now: () => now },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const request = (overrides: Partial<RequestContext> = {}): RequestContext => ({
  method: 'POST',
  path: '/chat',
  headers: {},
  requestId: 'req-1',
  traceId: 'trace-1',
  tenantId: 'global',
  routeId: 'root',
  upstreamId: 'local',
  provider: undefined,
  model: undefined,
  ...overrides,
});

describe('Wave B1 exports reachable from the package entry point', () => {
  it('exports ShardedLimiter, AdaptiveLimiter, and SemanticCache', () => {
    expect(ShardedLimiter).toBeDefined();
    expect(AdaptiveLimiter).toBeDefined();
    expect(SemanticCache).toBeDefined();
  });
});

describe('RateGuard.adaptiveRateLimit config wiring', () => {
  it('is undefined when adaptiveRateLimit is not enabled', () => {
    const guard = new RateGuard({ preset: 'dev' });
    expect(guard.adaptiveRateLimitFactor()).toBeUndefined();
    expect(guard.adaptiveRateLimitErrorRate()).toBeUndefined();
  });

  it('starts at factor 1.0 when enabled, and shrinks after real admit()/observe() failures', async () => {
    const { clock, advance } = fakeClock(0);
    const guard = new RateGuard({
      preset: 'dev',
      clock,
      rateLimit: { requestsPerSecond: 1_000, burst: 1_000 },
      adaptiveRateLimit: true,
      adaptive: { adjustIntervalMs: 100 },
    });

    expect(guard.adaptiveRateLimitFactor()).toBe(1.0);

    // Drive real requests through the public admit()/observe() surface —
    // this is what the middleware adapters do on every request. A run of
    // upstream 500s should feed AdaptiveLimiter.recordOutcome(false) and
    // shrink the effective rate, without the caller ever touching
    // AdaptiveLimiter directly.
    for (let i = 0; i < 5; i++) {
      const req = request({ requestId: `req-${i}` });
      const decision = await guard.runtime.admit(req);
      expect(decision.allowed).toBe(true);
      await guard.runtime.observe(req, { statusCode: 500, ...(decision.tokenBudgetReservationId ? { tokenBudgetReservationId: decision.tokenBudgetReservationId } : {}) }, clock.now());
      advance(150);
    }

    const factor = guard.adaptiveRateLimitFactor();
    expect(factor).toBeDefined();
    expect(factor as number).toBeLessThan(1.0);
    expect(guard.adaptiveRateLimitErrorRate()).toBeGreaterThan(0);
  });

  it('grows the factor back after a run of healthy observe() calls', async () => {
    const { clock, advance } = fakeClock(0);
    const guard = new RateGuard({
      preset: 'dev',
      clock,
      rateLimit: { requestsPerSecond: 1_000, burst: 1_000 },
      adaptiveRateLimit: true,
      adaptive: { adjustIntervalMs: 100 },
    });

    for (let i = 0; i < 5; i++) {
      const req = request({ requestId: `bad-${i}` });
      const decision = await guard.runtime.admit(req);
      await guard.runtime.observe(req, { statusCode: 500, ...(decision.tokenBudgetReservationId ? { tokenBudgetReservationId: decision.tokenBudgetReservationId } : {}) }, clock.now());
      advance(150);
    }
    const shrunk = guard.adaptiveRateLimitFactor() as number;
    expect(shrunk).toBeLessThan(1.0);

    for (let i = 0; i < 40; i++) {
      const req = request({ requestId: `good-${i}` });
      const decision = await guard.runtime.admit(req);
      await guard.runtime.observe(req, { statusCode: 200, ...(decision.tokenBudgetReservationId ? { tokenBudgetReservationId: decision.tokenBudgetReservationId } : {}) }, clock.now());
      advance(150);
    }
    expect(guard.adaptiveRateLimitFactor() as number).toBeGreaterThan(shrunk);
  });
});

describe('RateGuard.startGenAICall wiring', () => {
  it('is reachable from the RateGuard instance and produces a working GenAISpan', () => {
    const guard = new RateGuard({ preset: 'dev' });
    const span: GenAISpan = guard.startGenAICall({ provider: 'openai', model: 'gpt-4o', operation: 'chat' });

    span.recordChunk();
    const call = span.end({ promptTokens: 20, completionTokens: 10 });

    expect(call.provider).toBe('openai');
    expect(call.model).toBe('gpt-4o');
    expect(call.totalTokens).toBe(30);
    expect(call.estimatedCostUSD).toBeGreaterThan(0);
  });
});

describe('SemanticCache + Embedder reachable from the package entry point', () => {
  it('can be constructed and used directly by an external caller', async () => {
    const embedder: Embedder = { embed: async (text: string) => [text.length, 0] };
    const cache = new SemanticCache({ embedder }, { now: () => 0 });
    const embedding = await cache.embed('hello');
    cache.store('scope', embedding, { status: 200, headers: {}, body: 'ok' });
    expect(cache.lookup('scope', embedding)?.body).toBe('ok');
  });
});
