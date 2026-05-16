import { BoundedCache } from './bounded-cache.js';
import { lowerBound } from './utils.js';
import type { Clock, RateLimitDecision, RateLimitOptions } from '../types.js';

interface WindowState {
  timestamps: number[];
}

interface RemoteRateLimitResponse {
  allowed: boolean;
  remaining?: number;
  retry_after_ms?: number;
  retryAfterMs?: number;
}

/**
 * Local sliding-window rate limiter with optional remote control-plane fallback.
 */
export class RateLimiter {
  private readonly clock: Clock;
  private readonly keys: BoundedCache<string, WindowState>;

  constructor(options: { clock: Clock; capacity?: number }) {
    this.clock = options.clock;
    this.keys = new BoundedCache<string, WindowState>(options.capacity ?? 50_000);
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

  private allowLocal(key: string, options: Required<RateLimitOptions>): RateLimitDecision {
    const now = this.clock.now();
    const windowMs = options.windowMs > 0 ? options.windowMs : 1_000;
    const capacity = Math.max(1, options.requestsPerSecond + options.burst);

    const state = this.keys.getOrCreate(key, () => ({ timestamps: [] }));
    const cutoff = now - windowMs;
    const index = lowerBound(state.timestamps, cutoff);
    if (index > 0) {
      state.timestamps = state.timestamps.slice(index);
    }

    if (state.timestamps.length >= capacity) {
      const oldest = state.timestamps[0];
      const retryAfterMs = oldest === undefined ? windowMs : Math.max(1, oldest + windowMs - now);
      return {
        allowed: false,
        applied: true,
        remaining: 0,
        retryAfterMs,
        limit: capacity,
        degraded: false,
      };
    }

    state.timestamps.push(now);
    return {
      allowed: true,
      applied: true,
      remaining: Math.max(0, capacity - state.timestamps.length),
      retryAfterMs: 0,
      limit: capacity,
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
