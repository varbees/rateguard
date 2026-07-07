/**
 * Redis-backed distributed GCRA limiter — Node port of Go's redisGCRALimiter
 * (packages/sdk-go/redis_limiter.go).
 *
 * The admission math lives ENTIRELY inside the 4 Lua scripts below, copied
 * byte-for-byte from redis_limiter.go. Lua running inside Redis is the same
 * bytes regardless of which SDK submitted it, so cross-language behavioral
 * parity here is definitional, not something this file has to prove — the
 * scripts themselves are Go's, already covered by redis_limiter_test.go. Do
 * NOT edit the Lua bodies to "clean them up" or "port them to TypeScript";
 * that would silently fork the algorithm between languages.
 *
 * GCRA (Generic Cell Rate Algorithm) source:
 * https://en.wikipedia.org/wiki/Generic_cell_rate_algorithm
 *
 * What Node adds on top of the shared Lua is a thin client wrapper: a
 * structural interface any Redis client can satisfy (see RedisLimiterClient
 * below) plus the integer tier math (buildRedisGCRATier) that turns an
 * rps/burst policy into the (intervalUs, burst, ttlMs) arguments the Lua
 * expects.
 */

import type { Clock } from '../types.js';
import type { BucketState, RateLimitDecision, RateLimitOptions } from '../types.js';
import type { RateLimiterLike } from './rate-limiter.js';

// ── Lua scripts — copied verbatim from packages/sdk-go/redis_limiter.go ──
// Keep these byte-identical to the Go source. ARGV order for every script
// below: [intervalUs, burst, nowUs, ttlMs] (+ n for the increment script).

export const luaRedisGCRARateLimitScript = `
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[4])

if intervalUs == nil or burst == nil or nowUs == nil or ttlMs == nil or intervalUs <= 0 or burst <= 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - 1) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    -- Rounds to the nearest WHOLE SECOND (not millisecond) to match the
    -- in-memory limiter's retry_after semantics (AGENTS.md rule 13) — a
    -- deployment switching from in-process to Redis must not see deny
    -- behavior silently change.
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000000) * 1000
    return {0, 0, retryAfterMs, 1}
end

local newTat = math.max(tat, nowUs) + intervalUs
redis.call('SET', KEYS[1], tostring(newTat), 'PX', ttlMs)

local remaining = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
`;

// Read-only variant: reports what the GCRA would decide without advancing
// the theoretical arrival time. Used by Peek (pre-flight queries).
export const luaRedisGCRAPeekScript = `
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])

if intervalUs == nil or burst == nil or nowUs == nil or intervalUs <= 0 or burst <= 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - 1) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    -- Rounds to the nearest WHOLE SECOND (not millisecond) to match the
    -- in-memory limiter's retry_after semantics (AGENTS.md rule 13) — a
    -- deployment switching from in-process to Redis must not see deny
    -- behavior silently change.
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000000) * 1000
    return {0, 0, retryAfterMs, 1}
end

local wouldTat = math.max(tat, nowUs) + intervalUs
local remaining = math.max(math.floor(((burst * intervalUs) - (wouldTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
`;

// Generalized GCRA: consumes n cells atomically instead of exactly one.
// n=1 reduces to luaRedisGCRARateLimitScript exactly (tolerance = (burst-1)*interval,
// newTat = tat + interval); see redis_limiter_test.go for the equivalence check.
export const luaRedisGCRAIncrementScript = `
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[4])
local n = tonumber(ARGV[5])

if intervalUs == nil or burst == nil or nowUs == nil or ttlMs == nil or n == nil or intervalUs <= 0 or burst <= 0 or n < 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - n) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    -- Rounds to the nearest WHOLE SECOND (not millisecond) to match the
    -- in-memory limiter's retry_after semantics (AGENTS.md rule 13) — a
    -- deployment switching from in-process to Redis must not see deny
    -- behavior silently change.
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000000) * 1000
    return {0, 0, retryAfterMs, 1}
end

local newTat = math.max(tat, nowUs) + n * intervalUs
redis.call('SET', KEYS[1], tostring(newTat), 'PX', ttlMs)

local remaining = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
`;

export const luaRedisGCRAResetScript = `
redis.call('DEL', KEYS[1])
return 1
`;

/**
 * Minimal structural contract the SDK needs from a Redis client. This is
 * NOT a re-export of any concrete client's type — RateGuard has zero Redis
 * runtime dependency (see package.json: ioredis is a devDependency, used
 * only in this file's tests). Bring your own already-constructed client and
 * adapt it to this shape.
 *
 * Example ioredis adapter (illustrative — not wired up by this SDK):
 *
 *   import Redis from 'ioredis';
 *
 *   const redis = new Redis(process.env.REDIS_URL);
 *   const client: RedisLimiterClient = {
 *     // ioredis' own eval signature is positional: eval(script, numkeys, ...keysAndArgs)
 *     eval: (script, keys, ...args) => redis.eval(script, keys.length, ...keys, ...args),
 *   };
 *
 *   const guard = new RateGuard({ preset: 'standard', redisClient: client });
 *
 * A `node-redis` (`redis` package) client exposes `.eval(script, { keys, arguments })`
 * — the adapter shape differs slightly but the idea is the same: translate
 * your client's native eval call into this one method.
 */
export interface RedisLimiterClient {
  eval(script: string, keys: string[], ...args: Array<string | number>): Promise<unknown>;
}

/**
 * Converts an rps/burst admission policy into the integer GCRA tier the Lua
 * scripts operate on:
 *   - intervalUs: microseconds between admitted cells (ceil(1_000_000 / rps))
 *   - burst64: the burst capacity, unchanged (kept as its own return value
 *     for parity with Go's three-value return, which independently reports
 *     the rounded/validated burst)
 *   - ttlMs: how long Redis keeps the bucket key alive with no activity
 *     (ceil(intervalUs * burst / 1000)) — long enough for the bucket to
 *     fully drain and refill once, so an idle key expires instead of
 *     leaking forever
 *
 * Ported instruction-for-instruction from Go's buildRedisGCRATier
 * (redis_limiter.go) — same ceiling-division rounding, on purpose: a
 * fractional interval or TTL must round UP, never down, or the effective
 * rate would run hotter than configured.
 */
export function buildRedisGCRATier(rps: number, burst: number): { intervalUs: number; burst64: number; ttlMs: number } {
  if (rps <= 0 || burst <= 0) {
    return { intervalUs: 0, burst64: 0, ttlMs: 0 };
  }

  const windowUs = 1_000_000; // 1 second, expressed in microseconds
  let intervalUs = Math.floor(windowUs / rps);
  if (windowUs % rps !== 0) {
    intervalUs++;
  }
  if (intervalUs < 1) {
    intervalUs = 1;
  }

  const burst64 = burst;
  let ttlMs = Math.floor((intervalUs * burst64) / 1000);
  if ((intervalUs * burst64) % 1000 !== 0) {
    ttlMs++;
  }
  if (ttlMs < 1) {
    ttlMs = 1;
  }

  return { intervalUs, burst64, ttlMs };
}

/** Decodes a numeric-ish Lua/RESP reply value into a JS number, tolerant of string-encoded integers some clients return for large values. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/** The "no policy configured" decision every in-memory limiter also returns for rps<=0 || burst<=0. */
function unconfiguredDecision(): RateLimitDecision {
  return { allowed: true, applied: false, remaining: -1, retryAfterMs: 0, limit: -1, degraded: false };
}

/**
 * Fail-closed decision used when Redis itself is unreachable or errors.
 * Node's RateLimitDecision has no separate error channel the way Go's
 * `(AdmissionDecision, error)` return does — instead, callers (see
 * RateGuardRuntime.admit) already treat `degraded: true` as "map to a 503,
 * not a 429," which is exactly the fail-closed posture
 * TestHTTPMiddlewareFailsClosedWhenRedisLimiterErrors asserts in Go (the SDK
 * layer there overwrites the limiter's returned decision with Allowed:false
 * once err != nil). Encoding that same posture directly in the returned
 * decision, instead of throwing, keeps RedisGCRALimiter a drop-in
 * RateLimiterLike without requiring runtime.ts to grow a try/catch.
 */
function redisUnavailableDecision(limit: number): RateLimitDecision {
  return { allowed: false, applied: false, remaining: 0, retryAfterMs: 0, limit, degraded: true };
}

function decodeGCRAResult(result: unknown, limit: number): RateLimitDecision {
  if (!Array.isArray(result) || result.length !== 4) {
    return redisUnavailableDecision(limit);
  }

  const allowed = toNumber(result[0]) === 1;
  const remaining = toNumber(result[1]);
  const retryAfterMs = toNumber(result[2]);

  const decision: RateLimitDecision = {
    allowed,
    applied: true,
    remaining: allowed ? remaining : 0,
    retryAfterMs: retryAfterMs > 0 ? retryAfterMs : 0,
    limit,
    degraded: false,
  };
  return decision;
}

/**
 * Distributed token-bucket-shaped GCRA limiter backed by Redis. Implements
 * the same `RateLimiterLike` contract as `RateLimiter`/`ShardedLimiter` so it
 * can be dropped into `RateGuardRuntime` in their place (see
 * `redisClient` in `RateGuardOptions`), plus the `Store` primitives
 * (`get`/`increment`/`reset`) those in-memory limiters also expose.
 *
 * Every method is inherently async — this is a network call to Redis, never
 * a pure computation — which is why `RateLimiterLike.peek` is typed
 * `Promise<RateLimitDecision> | RateLimitDecision` rather than sync-only.
 */
export class RedisGCRALimiter implements RateLimiterLike {
  private readonly client: RedisLimiterClient;
  private readonly clock: Clock;

  constructor(client: RedisLimiterClient, clock: Clock) {
    this.client = client;
    this.clock = clock;
  }

  async allow(
    key: string,
    options: Required<RateLimitOptions> & { apiKey: string | undefined },
  ): Promise<RateLimitDecision> {
    return this.eval(key, options, luaRedisGCRARateLimitScript);
  }

  /** Reports what Allow would decide without advancing GCRA state. Never mutates Redis. */
  async peek(key: string, options: Required<RateLimitOptions>): Promise<RateLimitDecision> {
    return this.eval(key, options, luaRedisGCRAPeekScript);
  }

  /** Returns the current bucket state for key without consuming anything. Always delegates to Peek's read-only script — never the mutating one. */
  async get(key: string, options: Required<RateLimitOptions>): Promise<BucketState> {
    const decision = await this.peek(key, options);
    const tokens = decision.allowed ? decision.remaining : 0;
    return { tokens, capacity: options.burst, limit: options.requestsPerSecond };
  }

  /** Consumes n cells atomically via the generalized GCRA script. increment(key, options, 1) behaves identically to allow. */
  async increment(key: string, options: Required<RateLimitOptions>, n: number): Promise<RateLimitDecision> {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    if (rps <= 0 || burst <= 0) {
      return unconfiguredDecision();
    }

    const { intervalUs, burst64, ttlMs } = buildRedisGCRATier(rps, burst);
    if (intervalUs <= 0 || burst64 <= 0 || ttlMs <= 0) {
      return unconfiguredDecision();
    }

    const nowUs = Math.round(this.clock.now() * 1000);

    let result: unknown;
    try {
      result = await this.client.eval(luaRedisGCRAIncrementScript, [key], intervalUs, burst64, nowUs, ttlMs, n);
    } catch {
      return redisUnavailableDecision(rps);
    }

    return decodeGCRAResult(result, rps);
  }

  /** Clears key's bucket; the next access starts from a full bucket. */
  async reset(key: string): Promise<void> {
    try {
      await this.client.eval(luaRedisGCRAResetScript, [key]);
    } catch (err) {
      throw new Error(`rateguard: execute redis gcra reset: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async eval(key: string, options: Required<RateLimitOptions>, script: string): Promise<RateLimitDecision> {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    if (rps <= 0 || burst <= 0) {
      return unconfiguredDecision();
    }

    const { intervalUs, burst64, ttlMs } = buildRedisGCRATier(rps, burst);
    if (intervalUs <= 0 || burst64 <= 0 || ttlMs <= 0) {
      return unconfiguredDecision();
    }

    // Microseconds, matching Go's clock.Now().UTC().UnixNano() / 1000 — the
    // Lua scripts operate on a microsecond clock so a 1rps (1_000_000us
    // interval) policy has headroom below millisecond rounding.
    const nowUs = Math.round(this.clock.now() * 1000);

    let result: unknown;
    try {
      result = await this.client.eval(script, [key], intervalUs, burst64, nowUs, ttlMs);
    } catch {
      return redisUnavailableDecision(rps);
    }

    return decodeGCRAResult(result, rps);
  }
}
