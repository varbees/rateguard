/**
 * Sharded token-bucket limiter — Node port of Go's ShardedLimiter
 * (packages/sdk-go/sharded_limiter.go).
 *
 * HONEST SCOPE — read before reaching for this over `RateLimiter`:
 *
 * Go's ShardedLimiter exists to remove lock contention: 64 shard mutexes
 * (instead of one global mutex) plus a per-bucket atomic CAS loop so hot-key
 * admissions never block on a lock at all — a real win under concurrent
 * OS-thread access (the pattern uber-go/ratelimit proved).
 *
 * A single Node.js process runs JS on ONE thread. There is no OS-thread
 * contention for a lock-free structure to remove here — two "concurrent"
 * calls to `increment()` never actually race, because the event loop runs
 * each synchronous call to completion before the next one starts. Porting
 * the CAS-retry-loop shape to Node would just be decoration around a plain
 * read-modify-write; this file does not pretend otherwise.
 *
 * So why does this class exist in Node at all? Two honest reasons:
 *
 *   1. Decision parity. This is the SAME token-bucket math as `RateLimiter`,
 *      encoded the way Go encodes it (a single "bucket would be full at this
 *      instant" timestamp, `fullAt`, instead of a {tokens, lastRefill} pair).
 *      Cross-language conformance vectors (conformance/token_bucket_vectors.json)
 *      can replay against this implementation and assert it produces the
 *      identical (allowed, remaining, retry_after_ms) sequence Go's
 *      ShardedLimiter produces — proving the fullAt encoding is behaviorally
 *      equivalent to the {tokens, last} encoding, not just "close enough."
 *   2. An architectural on-ramp, not a shipped optimization. Node CAN run
 *      genuinely parallel code via `worker_threads`, and a `SharedArrayBuffer`
 *      + `Atomics` backed bucket array WOULD make cross-worker rate limiting
 *      lock-free for real. This class does NOT attempt that — it would be
 *      substantial additional work (a shared memory layout, worker-safe
 *      shard hashing, Atomics.compareExchange loops) that nothing here
 *      requires today. What this class does do is keep each bucket's entire
 *      state as one encoded number (`fullAt`), the same representation Go
 *      uses, specifically so that door stays open: swapping the `Map<string,
 *      { fullAt: number }>` backing store for a `Float64Array` view over a
 *      `SharedArrayBuffer` is a storage-layer change, not an algorithm
 *      rewrite, if someone builds that later.
 *
 * Algorithm (ms clock, matching Node's Clock interface; Go uses ns):
 *
 *   tokens(now)   = burst − max(0, fullAt − now) / 1000 × rps
 *   consume n     = newFullAt = now + (burst − (tokens − n)) / rps × 1000
 *   zero-value fullAt (0) encodes a full bucket — a freshly seen key needs
 *   no initialization write, and (unlike RateLimiter's explicit 10-minute
 *   idle reset) an arbitrarily idle bucket refills to full by construction:
 *   the math above saturates at `burst` once the deficit clears.
 *   deny: retryAfterMs = max(1000, ceil((n − tokens) / rps) × 1000) — the
 *   same whole-second-ceil rounding RateLimiter's incrementLocal/peek use
 *   (see rate-limiter.ts), asserted for both SDKs by the conformance vectors.
 *
 * Storage note: unlike Go's `boundedCache`-backed shards, this port uses a
 * plain, unbounded `Map` per shard — the point of this class is decision
 * parity for conformance testing, not production memory bounding. Callers
 * who need bounded key-space memory should use the default `RateLimiter`
 * (which already wraps a `BoundedCache`).
 *
 * Source: token bucket — https://en.wikipedia.org/wiki/Token_bucket
 */

import type { BucketState, Clock, RateLimitDecision, RateLimitOptions } from '../types.js';
import type { RateLimiterLike } from './rate-limiter.js';

/** Shard count — must be a power of two. Matches Go's `shardCount`. */
export const SHARDED_LIMITER_SHARD_COUNT = 64;

interface AtomicBucket {
  /** The instant (ms, per this.clock) at which the bucket would be full. */
  fullAt: number;
}

class LimiterShard {
  readonly buckets = new Map<string, AtomicBucket>();
}

/**
 * Lock-free-in-Go, plain-in-Node sharded token bucket limiter. See the
 * file-level doc comment for why this exists despite Node's single-threaded
 * execution model removing the contention problem Go's version solves.
 */
export class ShardedLimiter implements RateLimiterLike {
  private readonly clock: Clock;
  private readonly shards: LimiterShard[];

  constructor(options: { clock: Clock }) {
    this.clock = options.clock;
    this.shards = Array.from({ length: SHARDED_LIMITER_SHARD_COUNT }, () => new LimiterShard());
  }

  /**
   * Hashes key with an inlined 32-bit FNV-1a (zero allocations) and masks
   * into the shard array. Matching Go's 64-bit FNV-1a exactly is NOT
   * required — the shard count and hash function are internal implementation
   * details. What must match Go is the observable (allowed, remaining)
   * decision sequence, not which shard a key happens to land in.
   * Source: FNV hash — http://www.isthe.com/chongo/tech/comp/fnv/
   */
  private shardFor(key: string): LimiterShard {
    let hash = 0x811c9dc5; // FNV offset basis (32-bit)
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime (32-bit)
    }
    const index = (hash >>> 0) & (SHARDED_LIMITER_SHARD_COUNT - 1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.shards[index]!;
  }

  private bucketFor(key: string, create: boolean): AtomicBucket | undefined {
    const shard = this.shardFor(key);
    let bucket = shard.buckets.get(key);
    if (!bucket && create) {
      bucket = { fullAt: 0 }; // zero value = full bucket, no init write needed
      shard.buckets.set(key, bucket);
    }
    return bucket;
  }

  private tokensAt(fullAt: number, now: number, burst: number, rps: number): number {
    const deficitMs = fullAt - now;
    if (deficitMs <= 0) {
      return burst;
    }
    const tokens = burst - (deficitMs / 1000) * rps;
    return tokens < 0 ? 0 : tokens;
  }

  /** Mirrors RateLimiter's retry-after rounding exactly: whole seconds, floored at 1000ms. */
  private denyDecision(tokens: number, rps: number, need: number): RateLimitDecision {
    const retrySeconds = Math.ceil((need - tokens) / rps);
    const retryAfterMs = Math.max(1000, retrySeconds * 1000);
    return { allowed: false, applied: true, remaining: 0, retryAfterMs, limit: rps, degraded: false };
  }

  /** Allow is increment(key, options, 1) — no remote control-plane fallback exists at this layer. */
  allow(key: string, options: Required<RateLimitOptions> & { apiKey: string | undefined }): RateLimitDecision {
    return this.increment(key, options, 1);
  }

  /**
   * Consumes n tokens. Used when a single call costs more than one unit of
   * the limit (e.g. an LLM request billed by estimated token count).
   */
  increment(key: string, options: Required<RateLimitOptions>, n: number): RateLimitDecision {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    if (rps <= 0 || burst <= 0) {
      return { allowed: true, applied: false, remaining: -1, retryAfterMs: 0, limit: -1, degraded: false };
    }

    const now = this.clock.now();
    const bucket = this.bucketFor(key, true);
    // bucketFor(key, true) always returns a value when create=true.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const b = bucket!;

    const tokens = this.tokensAt(b.fullAt, now, burst, rps);
    if (tokens < n) {
      // Denials do not consume and need no state write: the deficit already
      // encoded in fullAt represents the refilled state.
      return this.denyDecision(tokens, rps, n);
    }

    const newTokens = tokens - n;
    b.fullAt = now + ((burst - newTokens) / rps) * 1000;

    const remaining = Math.max(0, Math.floor(newTokens));
    return { allowed: true, applied: true, remaining, retryAfterMs: 0, limit: rps, degraded: false };
  }

  /** Reports what allow() would decide right now WITHOUT consuming a token. Never creates bucket state for unseen keys. */
  peek(key: string, options: Required<RateLimitOptions>): RateLimitDecision {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    if (rps <= 0 || burst <= 0) {
      return { allowed: true, applied: false, remaining: -1, retryAfterMs: 0, limit: -1, degraded: false };
    }

    const now = this.clock.now();
    const bucket = this.bucketFor(key, false);
    if (!bucket) {
      return { allowed: true, applied: true, remaining: burst, retryAfterMs: 0, limit: rps, degraded: false };
    }

    const tokens = this.tokensAt(bucket.fullAt, now, burst, rps);
    if (tokens < 1) {
      return this.denyDecision(tokens, rps, 1);
    }
    return { allowed: true, applied: true, remaining: Math.floor(tokens), retryAfterMs: 0, limit: rps, degraded: false };
  }

  /** Returns current bucket state without consuming anything. Never creates bucket state for unseen keys. */
  get(key: string, options: Required<RateLimitOptions>): BucketState {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    const bucket = this.bucketFor(key, false);
    if (!bucket) {
      return { tokens: burst, capacity: burst, limit: rps };
    }

    const now = this.clock.now();
    const tokens = this.tokensAt(bucket.fullAt, now, burst, rps);
    return { tokens, capacity: burst, limit: rps };
  }

  /** Clears key's bucket; the next access starts from a full bucket. */
  reset(key: string): void {
    this.shardFor(key).buckets.delete(key);
  }
}
