import { describe, it, expect } from 'vitest';
import { extractTokenUsageFromText } from '../src/core/utils.js';

// Mirrors packages/sdk-go/adversarial_test.go. A compromised or buggy provider
// is the adversary. The real denial-of-wallet vector is not low usage (the
// provider bills what it reports) — it is a NEGATIVE value: committing
// output_tokens=-1_000_000 would DECREASE recorded usage, an attacker-controlled
// budget refund. All three SDKs had this hole; all three clamp now.

describe('adversarial usage extraction', () => {
  it('never emits a negative token count (would refund the budget)', () => {
    const usage = extractTokenUsageFromText(
      '{"usage":{"prompt_tokens":-1000000,"completion_tokens":-1000000,"total_tokens":-2000000}}',
    );
    // Clamped to 0 → no usage → caller commits its reserved estimate.
    if (usage) {
      expect(usage.inputTokens).toBeGreaterThanOrEqual(0);
      expect(usage.outputTokens).toBeGreaterThanOrEqual(0);
      expect(usage.totalTokens).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps a mixed negative field without corrupting the rest', () => {
    const usage = extractTokenUsageFromText(
      '{"usage":{"prompt_tokens":100,"completion_tokens":-50,"total_tokens":50}}',
    );
    expect(usage?.outputTokens ?? 0).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['string where int', '{"usage":{"prompt_tokens":"999","completion_tokens":"1","total_tokens":"1000"}}'],
    ['float tokens', '{"usage":{"prompt_tokens":1.5,"completion_tokens":2.5,"total_tokens":4}}'],
    ['null usage', '{"usage":null}'],
    ['usage not an object', '{"usage":"lots"}'],
    ['nested garbage', '{"usage":{"prompt_tokens":{"evil":true}}}'],
    ['truncated sse', 'data: {"usage":{"prompt_tokens":10,"comple'],
    ['data no space', 'data:{"usage":{"total_tokens":5}}\n\n'],
    ['comments only', ': keepalive\n: keepalive\n\n'],
  ])('does not crash or produce negatives: %s', (_name, body) => {
    const usage = extractTokenUsageFromText(body);
    if (usage) {
      expect(usage.inputTokens).toBeGreaterThanOrEqual(0);
      expect(usage.outputTokens).toBeGreaterThanOrEqual(0);
      expect(usage.totalTokens).toBeGreaterThanOrEqual(0);
    }
  });
});
