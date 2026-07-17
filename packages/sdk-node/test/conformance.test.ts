import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/core/rate-limiter.js';
import { ShardedLimiter } from '../src/core/sharded-limiter.js';
import { privateKeyFromRaw, signingPayload } from '../src/core/budget-attestation.js';
import { EvidenceChain, GENESIS_PREV_HASH } from '../src/core/evidence-chain.js';
import { issueSpendReceipt } from '../src/core/spend-receipt.js';
import { extractTokenUsageFromText } from '../src/core/utils.js';

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

// ── Evidence chain ──
//
// Rule 13: parity claims must be conformance-tested, not assumed. The entry
// hash covers a compact-JSON payload; Go, Node, and Python must produce the
// same bytes, and therefore the same hashes and head, from the same inputs.
// The vectors were generated by the Go reference implementation.

interface EvidenceChainVectors {
  seed_hex: string;
  issued_at_unix: number;
  genesis_prev_hash: string;
  claims: Array<{
    key: string;
    provider: string;
    model: string;
    window_start_unix: number;
    window_end_unix: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_micro_usd: number;
  }>;
  entries: Array<{
    seq: number;
    prev_hash: string;
    receipt_signature_b64: string;
    entry_hash: string;
  }>;
  chain_head: string;
  total_tokens: number;
  total_estimated_cost_micro_usd: number;
}

describe('Conformance: evidence chain', () => {
  it('reproduces the Go reference entry hashes and chain head', () => {
    const path = fileURLToPath(
      new URL('../../../conformance/evidence_chain_vectors.json', import.meta.url),
    );
    const v: EvidenceChainVectors = JSON.parse(readFileSync(path, 'utf-8'));
    expect(GENESIS_PREV_HASH).toBe(v.genesis_prev_hash);

    const priv = privateKeyFromRaw(Buffer.from(v.seed_hex, 'hex'));
    const chain = new EvidenceChain();

    v.claims.forEach((c, i) => {
      const receipt = issueSpendReceipt(
        priv,
        {
          key: c.key,
          provider: c.provider,
          model: c.model,
          windowStartUnix: c.window_start_unix,
          windowEndUnix: c.window_end_unix,
          inputTokens: c.input_tokens,
          outputTokens: c.output_tokens,
          totalTokens: c.total_tokens,
          estimatedCostMicroUSD: c.estimated_cost_micro_usd,
        },
        v.issued_at_unix,
      );
      const entry = chain.append(receipt);
      const want = v.entries[i]!;

      expect(entry.seq, `entry ${i} seq`).toBe(want.seq);
      expect(entry.prevHash, `entry ${i} prev_hash`).toBe(want.prev_hash);
      expect(entry.receipt.signature.toString('base64'), `entry ${i} signature`).toBe(
        want.receipt_signature_b64,
      );
      expect(entry.entryHash, `entry ${i} hash`).toBe(want.entry_hash);
    });

    expect(chain.head).toBe(v.chain_head);

    const pkg = chain.exportEvidence(v.issued_at_unix);
    expect(pkg.totalTokens).toBe(v.total_tokens);
    expect(pkg.totalEstimatedCostMicroUSD).toBe(v.total_estimated_cost_micro_usd);
  });
});

// ── Streaming usage extraction ──
//
// Rule 13: parity claims must be conformance-tested, not assumed. These
// vectors exist because Node and Python silently reported NO usage for the
// single-usage-event case (the OpenAI-compatible shape) while Go handled it
// correctly — a real divergence that every per-language suite passed through.

interface SSEUsageVectors {
  cases: Array<{
    name: string;
    note: string;
    sse: string;
    expect_found: boolean;
    expect_input_tokens: number;
    expect_output_tokens: number;
    expect_total_tokens: number;
  }>;
}

describe('Conformance: streaming usage extraction', () => {
  const sseVectors: SSEUsageVectors = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../conformance/sse_usage_vectors.json', import.meta.url)),
      'utf-8',
    ),
  );

  for (const c of sseVectors.cases) {
    it(c.name, () => {
      const usage = extractTokenUsageFromText(c.sse);

      if (!c.expect_found) {
        expect(usage === undefined || usage.totalTokens === 0, c.note).toBe(true);
        return;
      }

      expect(usage, `no usage extracted — ${c.note}`).toBeDefined();
      expect(usage!.inputTokens, c.note).toBe(c.expect_input_tokens);
      expect(usage!.outputTokens, c.note).toBe(c.expect_output_tokens);
      expect(usage!.totalTokens, c.note).toBe(c.expect_total_tokens);
    });
  }
});
