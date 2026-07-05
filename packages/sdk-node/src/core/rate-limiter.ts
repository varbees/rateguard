/**
 * Token-bucket rate limiter — same algorithm across all 3 RateGuard SDKs.
 *
 * Algorithm: Token Bucket (RFC standards track, used by Kong, Envoy, AWS API Gateway)
 * - max_tokens = burst (bucket capacity)
 * - refill_rate = requests_per_second (tokens added per second)
 * - On each request: refill = elapsed × refill_rate, clamp to max_tokens
 * - Allow if tokens >= 1.0, consume 1 token
 * - Retry-after: ceil(deficit_seconds) rounded up to the next whole second,
 *   floored at 1000ms — matches the Go and Python SDKs exactly (cross-checked
 *   by conformance/token_bucket_vectors.json) so a client backing off on
 *   retry_after_ms behaves identically regardless of which SDK served it.
 *
 * Source: https://en.wikipedia.org/wiki/Token_bucket
 */

import { BoundedCache } from './bounded-cache.js';
import type { BucketState, Clock, RateLimitDecision, RateLimitOptions } from '../types.js';

interface Bucket {
  tokens: number; // float — fractional tokens for smooth refill
  last: number;   // ms timestamp
}

interface RemoteRateLimitResponse {
  allowed: boolean;
  remaining?: number;
  retry_after_ms?: number;
  retryAfterMs?: number;
}

/**
 * In-process token-bucket rate limiter with optional remote control-plane fallback.
 */
export class RateLimiter {
  private readonly clock: Clock;
  private readonly buckets: BoundedCache<string, Bucket>;

  constructor(options: { clock: Clock; capacity?: number }) {
    this.clock = options.clock;
    this.buckets = new BoundedCache<string, Bucket>(options.capacity ?? 50_000);
  }

  async allow(
    key: string,
    options: Required<RateLimitOptions> & { apiKey: string | undefined },
  ): Promise<RateLimitDecision> {
    const local = this.allowLocal(key, options);
    if (!local.allowed) {
      return local;
    }

    if (!options.remoteRateLimitEndpoint) {
      return local;
    }

    try {
      const response = await fetch(options.remoteRateLimitEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          key,
          requests_per_second: options.requestsPerSecond,
          burst: options.burst,
          window_ms: options.windowMs,
        }),
      });

      if (!response.ok) {
        return remoteUnavailable(local);
      }

      const body: unknown = await response.json();
      if (isRemoteRateLimitResponse(body)) {
        return {
          allowed: body.allowed,
          applied: true,
          remaining: typeof body.remaining === 'number' ? body.remaining : local.remaining,
          retryAfterMs:
            typeof body.retry_after_ms === 'number'
              ? body.retry_after_ms
              : typeof body.retryAfterMs === 'number'
                ? body.retryAfterMs
                : local.retryAfterMs,
          limit: local.limit,
          degraded: false,
        };
      }

      return remoteUnavailable(local);
    } catch {
      return remoteUnavailable(local);
    }
  }

  /**
   * Reports what allow() would decide right now WITHOUT consuming a token.
   * Pre-flight queries (MCP tools, dashboards) must use peek, never allow.
   */
  peek(key: string, options: Required<RateLimitOptions>): RateLimitDecision {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    if (rps <= 0 || burst <= 0) {
      return { allowed: true, applied: false, remaining: -1, retryAfterMs: 0, limit: -1, degraded: false };
    }

    const now = this.clock.now();
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return { allowed: true, applied: true, remaining: burst, retryAfterMs: 0, limit: rps, degraded: false };
    }

    let tokens = bucket.tokens;
    if (now - bucket.last > 600_000) {
      tokens = burst;
    } else {
      const elapsed = (now - bucket.last) / 1000;
      if (elapsed > 0) {
        tokens = Math.min(burst, tokens + elapsed * rps);
      }
    }

    if (tokens < 1.0) {
      const deficit = (1.0 - tokens) / rps;
      return {
        allowed: false,
        applied: true,
        remaining: 0,
        retryAfterMs: Math.max(1000, Math.ceil(deficit) * 1000),
        limit: rps,
        degraded: false,
      };
    }

    return {
      allowed: true,
      applied: true,
      remaining: Math.max(0, Math.floor(tokens)),
      retryAfterMs: 0,
      limit: rps,
      degraded: false,
    };
  }

  private allowLocal(key: string, options: Required<RateLimitOptions>): RateLimitDecision {
    return this.incrementLocal(key, options, 1);
  }

  /**
   * Consumes n tokens atomically. allowLocal(key, options) is equivalent to
   * incrementLocal(key, options, 1). Used when a single call costs more than
   * one unit of the limit — e.g. an LLM request billed by estimated token
   * count rather than by call count.
   */
  private incrementLocal(key: string, options: Required<RateLimitOptions>, n: number): RateLimitDecision {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    if (rps <= 0 || burst <= 0) {
      return { allowed: true, applied: false, remaining: -1, retryAfterMs: 0, limit: -1, degraded: false };
    }

    const now = this.clock.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: burst, last: now };
      this.buckets.set(key, bucket);
    }

    // Idle bucket: reset after 10 minutes of inactivity
    if (now - bucket.last > 600_000) {
      bucket.tokens = burst;
      bucket.last = now;
    }

    // Token bucket refill: tokens = min(burst, tokens + elapsed × rps)
    const elapsed = (now - bucket.last) / 1000; // ms → seconds
    if (elapsed > 0) {
      bucket.tokens = Math.min(burst, bucket.tokens + elapsed * rps);
      bucket.last = now;
    }

    // Deny if not enough tokens
    if (bucket.tokens < n) {
      const deficit = (n - bucket.tokens) / rps;
      const retryAfterMs = Math.max(1000, Math.ceil(deficit) * 1000);
      return {
        allowed: false,
        applied: true,
        remaining: 0,
        retryAfterMs,
        limit: rps,
        degraded: false,
      };
    }

    // Allow: consume n tokens
    bucket.tokens -= n;
    return {
      allowed: true,
      applied: true,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterMs: 0,
      limit: rps,
      degraded: false,
    };
  }

  /**
   * Consumes n tokens atomically, bypassing the optional remote control-plane
   * fallback that allow() performs. increment(key, options, 1) behaves
   * identically to the local decision allow() would make.
   */
  increment(key: string, options: Required<RateLimitOptions>, n: number): RateLimitDecision {
    return this.incrementLocal(key, options, n);
  }

  /**
   * Returns the current bucket state for key without consuming anything.
   * Never creates bucket state for unseen keys.
   */
  get(key: string, options: Required<RateLimitOptions>): BucketState {
    const rps = options.requestsPerSecond;
    const burst = options.burst;
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return { tokens: burst, capacity: burst, limit: rps };
    }

    const now = this.clock.now();
    let tokens = bucket.tokens;
    if (now - bucket.last > 600_000) {
      tokens = burst;
    } else {
      const elapsed = (now - bucket.last) / 1000;
      if (elapsed > 0) {
        tokens = Math.min(burst, tokens + elapsed * rps);
      }
    }

    return { tokens, capacity: burst, limit: rps };
  }

  /**
   * Clears key's bucket; the next access starts from a full bucket.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}

function remoteUnavailable(local: RateLimitDecision): RateLimitDecision {
  return {
    ...local,
    allowed: false,
    applied: false,
    remaining: 0,
    retryAfterMs: 0,
    degraded: true,
  };
}

function isRemoteRateLimitResponse(value: unknown): value is RemoteRateLimitResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.allowed === 'boolean';
}
