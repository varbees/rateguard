import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/core/rate-limiter.js';
import { ShardedLimiter } from '../src/core/sharded-limiter.js';
import { signingPayload } from '../src/core/budget-attestation.js';

interface ConformanceVectors {
  policy: { requests_per_second: number; burst: number };
  steps: Array<{ note: string; advance_ms: number; n: number; allowed: boolean; remaining: number; retry_after_ms: number }>;
}

interface ExpiryVectors {
  cases: Array<{ note: string; epoch_ms: number; expected: string }>;
}

const vectorsPath = fileURLToPath(new URL('../../../conformance/token_bucket_vectors.json', import.meta.url));
const vectors: ConformanceVectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));

const expiryVectorsPath = fileURLToPath(
  new URL('../../../conformance/budget_attestation_expiry_vectors.json', import.meta.url),
);
const expiryVectors: ExpiryVectors = JSON.parse(readFileSync(expiryVectorsPath, 'utf-8'));

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

  /**
   * ShardedLimiter is a different internal representation (a single
   * "bucket-full-at" timestamp instead of {tokens, last}) of the SAME
   * algorithm. Replaying the shared oracle against it too is exactly what
   * proves decision parity, not just "looks similar."
   */
  it('matches the shared oracle via ShardedLimiter', () => {
    const { clock, advance } = fakeClock(0);
    const limiter = new ShardedLimiter({ clock });
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

/**
 * Replays the shared oracle in conformance/budget_attestation_expiry_vectors.json
 * against signingPayload, proving Node formats expires_at identically to Go
 * and Python inside the Ed25519 signing payload — not just that Node's own
 * round-trip tests pass. A failure here means a cross-language attested
 * budget token would fail to verify.
 */
describe('Conformance: budget attestation expiry formatting', () => {
  it('matches the shared oracle', () => {
    const { publicKey } = generateKeyPairSync('ed25519');

    for (const [i, tc] of expiryVectors.cases.entries()) {
      const grant = {
        maxTokens: 100,
        maxDepth: 1,
        expiresAt: new Date(tc.epoch_ms),
      };
      const raw = signingPayload(grant, publicKey);
      const decoded = JSON.parse(raw.toString('utf8'));
      expect(decoded.expires_at, `case ${i} (${tc.note})`).toBe(tc.expected);
    }
  });
});
