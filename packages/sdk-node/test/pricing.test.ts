import { describe, it, expect } from 'vitest';
import { estimateCost, estimateCostWith, normalizeModelId, StaticPricing } from '../src/core/genai.js';

describe('normalizeModelId', () => {
  const cases: Record<string, string> = {
    'gpt-4o-2024-08-06': 'gpt-4o', // OpenAI ISO snapshot
    'gpt-4.1-2025-04-14': 'gpt-4.1', // dotted version kept
    'o3-2025-04-16': 'o3',
    'claude-sonnet-4-20250514': 'claude-sonnet-4', // Anthropic compact date
    'claude-opus-4-5-20251101': 'claude-opus-4-5', // date stripped, minor kept
    'gemini-2.5-flash-09-2025': 'gemini-2.5-flash', // MM-YYYY
    'gemini-2.5-flash-preview': 'gemini-2.5-flash',
    'gemini-2.5-flash-latest': 'gemini-2.5-flash',
    'GPT-4O': 'gpt-4o', // case-folded
    'gpt-4o-mini': 'gpt-4o-mini', // meaningful word NOT stripped
    'o4-mini': 'o4-mini',
    'claude-sonnet-4-5': 'claude-sonnet-4-5', // bare minor version NOT stripped
    'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite', // lite NOT stripped
    'my-custom-finetune': 'my-custom-finetune',
  };
  for (const [input, want] of Object.entries(cases)) {
    it(`normalizes ${input} -> ${want}`, () => {
      expect(normalizeModelId(input)).toBe(want);
    });
  }
});

describe('pricing', () => {
  it('matches a dated snapshot to its base table entry (not $0)', () => {
    const bare = estimateCost('gpt-4o', 1000, 1000);
    expect(bare).toBeGreaterThan(0);
    expect(estimateCost('gpt-4o-2024-08-06', 1000, 1000)).toBe(bare);
  });

  it('a StaticPricing provider overrides, normalizes, and falls through', () => {
    const p = new StaticPricing({
      'my-model': { promptUSDPer1K: 0.001, completionUSDPer1K: 0.002 },
      'gpt-4o': { promptUSDPer1K: 1.0, completionUSDPer1K: 2.0 }, // override built-in
    });
    // custom model the table has never heard of
    expect(estimateCostWith(p, 'my-model', 1000, 1000)).toBeCloseTo(0.003);
    // override wins over the built-in table
    expect(estimateCostWith(p, 'gpt-4o', 1000, 1000)).toBeCloseTo(3.0);
    // dated snapshot of the overridden model resolves via normalization
    expect(estimateCostWith(p, 'gpt-4o-2024-08-06', 1000, 1000)).toBeCloseTo(3.0);
    // provider miss falls through to the built-in table
    expect(estimateCostWith(p, 'claude-sonnet-4', 1000, 1000)).toBeGreaterThan(0);
    // unknown everywhere -> zero, never fabricated
    expect(estimateCostWith(p, 'totally-unknown-model', 1000, 1000)).toBe(0);
  });
});
