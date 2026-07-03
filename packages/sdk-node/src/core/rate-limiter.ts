/**
 * Token-bucket rate limiter — same algorithm across all 3 RateGuard SDKs.
 *
 * Algorithm: Token Bucket (RFC standards track, used by Kong, Envoy, AWS API Gateway)
 * - max_tokens = burst (bucket capacity)
 * - refill_rate = requests_per_second (tokens added per second)
 * - On each request: refill = elapsed × refill_rate, clamp to max_tokens
 * - Allow if tokens >= 1.0, consume 1 token
 * - Retry-after: time until bucket refills to 1.0 tokens
 *
 * Source: https://en.wikipedia.org/wiki/Token_bucket
 */

import { BoundedCache } from './bounded-cache.js';
import type { Clock, RateLimitDecision, RateLimitOptions } from '../types.js';

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
        retryAfterMs: Math.max(1000, Math.ceil(deficit * 1000)),
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
    if (bucket.tokens < 1.0) {
      const deficit = (1.0 - bucket.tokens) / rps;
      const retryAfterMs = Math.max(1000, Math.ceil(deficit * 1000));
      return {
        allowed: false,
        applied: true,
        remaining: 0,
        retryAfterMs,
        limit: rps,
        degraded: false,
      };
    }

    // Allow: consume 1 token
    bucket.tokens -= 1.0;
    return {
      allowed: true,
      applied: true,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterMs: 0,
      limit: rps,
      degraded: false,
    };
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
