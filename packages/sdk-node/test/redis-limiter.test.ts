import { afterAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import {
  RedisGCRALimiter,
  buildRedisGCRATier,
  luaRedisGCRAIncrementScript,
  luaRedisGCRAPeekScript,
  luaRedisGCRAResetScript,
  luaRedisGCRARateLimitScript,
  type RedisLimiterClient,
} from '../src/core/redis-limiter.js';
import { RateGuard } from '../src/index.js';
import type { RequestContext } from '../src/types.js';

const baseOptions = {
  windowMs: 60_000,
  remoteRateLimitEndpoint: '',
  apiKey: undefined as string | undefined,
};

function fakeClock(startMs: number) {
  let now = startMs;
  return {
    clock: { now: () => now },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

// ── buildRedisGCRATier: pure integer math, hand-checked against Go's ──
// ceiling-division rounding (redis_limiter.go's buildRedisGCRATier).
describe('buildRedisGCRATier', () => {
  it('rps=10 burst=20 -> intervalUs=100000 ttlMs=2000 (exact division, no ceiling needed)', () => {
    expect(buildRedisGCRATier(10, 20)).toEqual({ intervalUs: 100_000, burst64: 20, ttlMs: 2_000 });
  });

  it('rps=1 burst=1 -> intervalUs=1_000_000 ttlMs=1000', () => {
    expect(buildRedisGCRATier(1, 1)).toEqual({ intervalUs: 1_000_000, burst64: 1, ttlMs: 1_000 });
  });

  it('rps=3 burst=5 -> ceils the non-exact interval and TTL divisions', () => {
    // 1_000_000 / 3 = 333333.33 -> ceil to 333334; 333334 * 5 / 1000 = 1667.67 -> ceil to 1667
    expect(buildRedisGCRATier(3, 5)).toEqual({ intervalUs: 333_334, burst64: 5, ttlMs: 1_667 });
  });

  it('rps=1000 burst=2000 -> exact division throughout', () => {
    expect(buildRedisGCRATier(1000, 2000)).toEqual({ intervalUs: 1_000, burst64: 2_000, ttlMs: 2_000 });
  });

  it('rps<=0 or burst<=0 -> all zero (unconfigured)', () => {
    expect(buildRedisGCRATier(0, 20)).toEqual({ intervalUs: 0, burst64: 0, ttlMs: 0 });
    expect(buildRedisGCRATier(10, 0)).toEqual({ intervalUs: 0, burst64: 0, ttlMs: 0 });
    expect(buildRedisGCRATier(-1, 20)).toEqual({ intervalUs: 0, burst64: 0, ttlMs: 0 });
  });
});

/**
 * Records the script/keys/args of the last eval() call and returns a fixed
 * response — mirrors Go's recordingRedisLimiterClient in
 * redis_limiter_test.go, reusing the SAME known-good (input, response) pairs
 * those Go tests assert on, so this test proves the Node SDK dispatches the
 * right script with the right ARGV order and decodes the reply correctly.
 * It does NOT prove the Lua script's admission math is correct — that is
 * Go's job (redis_limiter_test.go), and the Lua text here is byte-identical
 * to Go's, so it doesn't need re-proving per language.
 */
class RecordingClient implements RedisLimiterClient {
  lastScript = '';
  lastKeys: string[] = [];
  lastArgs: Array<string | number> = [];
  constructor(private readonly response: unknown) {}

  async eval(script: string, keys: string[], ...args: Array<string | number>): Promise<unknown> {
    this.lastScript = script;
    this.lastKeys = keys;
    this.lastArgs = args;
    return this.response;
  }
}

class FailingClient implements RedisLimiterClient {
  async eval(): Promise<unknown> {
    throw new Error('redis unavailable');
  }
}

/** Allowed on the first call, denied (retryAfterMs=1) on every call after — mirrors Go's fakeRedisLimiterClient. */
class SequencedClient implements RedisLimiterClient {
  calls = 0;
  lastArgs: Array<string | number> = [];

  async eval(_script: string, _keys: string[], ...args: Array<string | number>): Promise<unknown> {
    this.lastArgs = args;
    this.calls++;
    if (this.calls === 1) {
      return [1, 0, 0, 0];
    }
    return [0, 0, 1, 1];
  }
}

describe('RedisGCRALimiter — calling contract (mocked client)', () => {
  it('Increment dispatches the generalized script and sends n as the 5th ARGV', async () => {
    // Known-good pair from Go's TestRedisStoreIncrementSendsN.
    const client = new RecordingClient([1, 7, 0, 0]);
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);

    const decision = await limiter.increment('tenant-a', { ...baseOptions, requestsPerSecond: 10, burst: 20 }, 5);

    expect(client.lastScript).toBe(luaRedisGCRAIncrementScript);
    expect(client.lastArgs).toHaveLength(5);
    expect(client.lastArgs[4]).toBe(5);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(7);
  });

  it('Get delegates to the read-only Peek script, never the mutating one', async () => {
    // Known-good pair from Go's TestRedisStoreGetDelegatesToPeek.
    const client = new RecordingClient([1, 12, 0, 0]);
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);

    const state = await limiter.get('tenant-a', { ...baseOptions, requestsPerSecond: 10, burst: 20 });

    expect(client.lastScript).toBe(luaRedisGCRAPeekScript);
    expect(state).toEqual({ tokens: 12, capacity: 20, limit: 10 });
  });

  it('Reset dispatches the DEL script against exactly [key]', async () => {
    const client = new RecordingClient([]);
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);

    await limiter.reset('tenant-a');

    expect(client.lastScript).toBe(luaRedisGCRAResetScript);
    expect(client.lastKeys).toEqual(['tenant-a']);
  });

  it('Allow dispatches the rate-limit script with (intervalUs, burst, nowUs, ttlMs) in order', async () => {
    const client = new RecordingClient([1, 19, 0, 0]);
    const { clock } = fakeClock(1_752_000_000_000); // arbitrary fixed ms instant
    const limiter = new RedisGCRALimiter(client, clock);

    await limiter.allow('k', { ...baseOptions, requestsPerSecond: 10, burst: 20, apiKey: undefined });

    expect(client.lastScript).toBe(luaRedisGCRARateLimitScript);
    const { intervalUs, burst64, ttlMs } = buildRedisGCRATier(10, 20);
    expect(client.lastArgs).toEqual([intervalUs, burst64, 1_752_000_000_000 * 1000, ttlMs]);
  });

  it('Peek never mutates: same script + args shape as Allow, decoded the same way', async () => {
    const client = new RecordingClient([1, 3, 0, 0]);
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);

    const decision = await limiter.peek('k', { ...baseOptions, requestsPerSecond: 10, burst: 20 });

    expect(client.lastScript).toBe(luaRedisGCRAPeekScript);
    expect(decision).toEqual({ allowed: true, applied: true, remaining: 3, retryAfterMs: 0, limit: 10, degraded: false });
  });

  it('uses the injected clock in microseconds for nowUs (ARGV[3])', async () => {
    const client = new RecordingClient([1, 0, 0, 0]);
    const fixedMs = 1_773_000_000_000;
    const limiter = new RedisGCRALimiter(client, { now: () => fixedMs });

    await limiter.allow('tenant-a', { ...baseOptions, requestsPerSecond: 1, burst: 1, apiKey: undefined });

    expect(client.lastArgs[2]).toBe(fixedMs * 1000);
  });

  it('denies on the second call once the bucket is exhausted, exposing retryAfterMs', async () => {
    const client = new SequencedClient();
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);
    const options = { ...baseOptions, requestsPerSecond: 1, burst: 1, apiKey: undefined };

    const first = await limiter.allow('k', options);
    expect(first.allowed).toBe(true);

    const second = await limiter.allow('k', options);
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
    expect(second.retryAfterMs).toBe(1);
  });

  it('fails closed (degraded, not allowed) when Redis eval() rejects — never throws out of allow/peek', async () => {
    const client = new FailingClient();
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);
    const options = { ...baseOptions, requestsPerSecond: 10, burst: 20, apiKey: undefined };

    const allowDecision = await limiter.allow('k', options);
    expect(allowDecision.allowed).toBe(false);
    expect(allowDecision.degraded).toBe(true);

    const peekDecision = await limiter.peek('k', options);
    expect(peekDecision.allowed).toBe(false);
    expect(peekDecision.degraded).toBe(true);
  });

  it('Reset surfaces a real error when eval() rejects (no silent state to fail closed on)', async () => {
    const client = new FailingClient();
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);
    await expect(limiter.reset('k')).rejects.toThrow(/redis unavailable/);
  });

  it('reports the unconfigured decision (allowed, not applied) when rps or burst is <= 0', async () => {
    const client = new RecordingClient([1, 0, 0, 0]);
    const { clock } = fakeClock(Date.now());
    const limiter = new RedisGCRALimiter(client, clock);

    const decision = await limiter.allow('k', { ...baseOptions, requestsPerSecond: 0, burst: 20, apiKey: undefined });
    expect(decision).toEqual({ allowed: true, applied: false, remaining: -1, retryAfterMs: 0, limit: -1, degraded: false });
    // Never touched the client — no eval() call was needed.
    expect(client.lastScript).toBe('');
  });
});

describe('RateGuard wiring: redisClient option replaces the in-process limiter', () => {
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

  it('routes real admit() calls through the injected Redis client, not the in-memory limiter', async () => {
    const client = new SequencedClient();
    const guard = new RateGuard({
      preset: 'dev',
      rateLimit: { requestsPerSecond: 1, burst: 1 },
      redisClient: client,
    });

    const first = await guard.runtime.admit(request({ requestId: 'r1' }));
    expect(first.allowed).toBe(true);
    expect(client.calls).toBe(1);

    const second = await guard.runtime.admit(request({ requestId: 'r2' }));
    expect(second.allowed).toBe(false);
    expect(second.statusCode).toBe(429);
    expect(client.calls).toBe(2);
  });

  it('maps a Redis outage to a 503 (fail-closed), same posture as the remote-endpoint fallback', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      rateLimit: { requestsPerSecond: 10, burst: 20 },
      redisClient: new FailingClient(),
    });

    const decision = await guard.runtime.admit(request());
    expect(decision.allowed).toBe(false);
    expect(decision.statusCode).toBe(503);
    expect(decision.errorCode).toBe('rate_limit_unavailable');
  });

  it('get_rate_limit_state MCP tool awaits the (now-async) Redis peek and reports the real decision', async () => {
    const client = new RecordingClient([1, 9, 0, 0]);
    const guard = new RateGuard({
      preset: 'dev',
      rateLimit: { requestsPerSecond: 10, burst: 20 },
      redisClient: client,
    });

    const result = await guard.mcpCall('get_rate_limit_state', { key: 'agent-1' });
    const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(payload.allowed).toBe(true);
    expect(payload.remaining).toBe(9);
    expect(client.lastScript).toBe(luaRedisGCRAPeekScript);
  });
});

// ── Real Redis integration (only runs if a server could be spawned) ──
//
// redis-server (or a protocol-compatible fork like Valkey) is on PATH in
// this environment but nothing is listening on 6379 by default, so this
// suite spins up a disposable instance on an ephemeral port instead of
// requiring one to already be running. If spawning fails for any reason
// (binary missing, sandboxed environment with no process/network
// permissions, port conflict), the suite skips instead of failing — per the
// task brief, a mocked-client suite alone is an acceptable fallback, real
// Redis is a bonus when available.
let redisProc: ChildProcessByStdio<null, Readable, Readable> | undefined;
let redisPort = 0;
let redisReady = false;

async function waitForRedis(port: number, deadlineMs: number): Promise<boolean> {
  const RedisCtor = (await import('ioredis')).default;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const probe = new RedisCtor({ port, lazyConnect: true, retryStrategy: () => null });
    try {
      await probe.connect();
      await probe.ping();
      probe.disconnect();
      return true;
    } catch {
      probe.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
}

// NOTE: this spawn-and-probe must happen via top-level await, not inside a
// beforeAll(). Vitest evaluates `describe.skipIf(...)`'s condition during
// test COLLECTION, which happens before any beforeAll hook runs — a
// beforeAll-set `redisReady` would always still be `false` by the time
// skipIf reads it, silently skipping the real-Redis suite forever.
redisPort = 34_000 + Math.floor(Math.random() * 5_000);
try {
  redisProc = spawn('redis-server', ['--port', String(redisPort), '--save', '', '--appendonly', 'no'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  redisReady = await waitForRedis(redisPort, 4_000);
} catch {
  redisReady = false;
}

afterAll(() => {
  redisProc?.kill();
});

describe.skipIf(!redisReady || Boolean(process.env.CI))('RedisGCRALimiter against a real Redis/Valkey server', () => {
  it('admits up to burst, denies after, and reports a positive Retry-After', async () => {
    const RedisCtor = (await import('ioredis')).default;
    const redis = new RedisCtor({ port: redisPort });
    const client: RedisLimiterClient = {
      eval: (script, keys, ...args) => redis.eval(script, keys.length, ...keys, ...args) as Promise<unknown>,
    };

    const limiter = new RedisGCRALimiter(client, { now: () => Date.now() });
    const options = { ...baseOptions, requestsPerSecond: 5, burst: 3, apiKey: undefined };
    const key = `test:${Math.random()}`;

    const first = await limiter.increment(key, options, 1);
    const second = await limiter.increment(key, options, 1);
    const third = await limiter.increment(key, options, 1);
    const fourth = await limiter.increment(key, options, 1);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);

    await limiter.reset(key);
    const afterReset = await limiter.increment(key, options, 1);
    expect(afterReset.allowed).toBe(true);

    redis.disconnect();
  });

  it('Peek never advances state — repeated peeks report the same remaining as the first', async () => {
    const RedisCtor = (await import('ioredis')).default;
    const redis = new RedisCtor({ port: redisPort });
    const client: RedisLimiterClient = {
      eval: (script, keys, ...args) => redis.eval(script, keys.length, ...keys, ...args) as Promise<unknown>,
    };

    const limiter = new RedisGCRALimiter(client, { now: () => Date.now() });
    const options = { ...baseOptions, requestsPerSecond: 5, burst: 10, apiKey: undefined };
    const key = `test:peek:${Math.random()}`;

    const before = await limiter.peek(key, options);
    for (let i = 0; i < 3; i++) {
      await limiter.peek(key, options);
    }
    const after = await limiter.peek(key, options);
    expect(after.remaining).toBe(before.remaining);

    redis.disconnect();
  });
});
