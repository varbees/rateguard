import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/core/rate-limiter.js';

interface ConformanceVectors {
  policy: { requests_per_second: number; burst: number };
  steps: Array<{ note: string; advance_ms: number; n: number; allowed: boolean; remaining: number; retry_after_ms: number }>;
}

const vectorsPath = fileURLToPath(new URL('../../../conformance/token_bucket_vectors.json', import.meta.url));
const vectors: ConformanceVectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));

function fakeClock(startMs: number) {
  let now = startMs;
  return {
    clock: { now: () => now },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/**
 * Replays the same admission sequence used by the Go and Python SDKs against
 * the shared oracle in conformance/token_bucket_vectors.json. A failure here
 * means Node has drifted from the documented cross-language behavior — not
 * just from its own past test suite.
 */
describe('Conformance: token bucket', () => {
  it('matches the shared oracle', () => {
    const { clock, advance } = fakeClock(0);
    const limiter = new RateLimiter({ clock, capacity: 1_000 });
    const options = {
      requestsPerSecond: vectors.policy.requests_per_second,
      burst: vectors.policy.burst,
      windowMs: 60_000,
      remoteRateLimitEndpoint: '',
      apiKey: undefined as string | undefined,
    };

    for (const [i, step] of vectors.steps.entries()) {
      advance(step.advance_ms);
      const d = limiter.increment('conformance-key', options, step.n);
      expect(d.allowed, `step ${i} (${step.note})`).toBe(step.allowed);
      if (step.allowed) {
        expect(d.remaining, `step ${i} (${step.note})`).toBe(step.remaining);
      } else {
        expect(d.retryAfterMs, `step ${i} (${step.note})`).toBe(step.retry_after_ms);
      }
    }
  });
});
