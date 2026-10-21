import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { estimateCost, estimateCostWith, estimateUsageCost, estimateUsageCostWith, pricedModels, StaticPricing } from '../src/core/genai.js';

// conformance/pricing.json is the single source of the built-in price table;
// all three SDKs replay it. A row that prices differently in any SDK, or a
// current model that prices at $0, fails here.
interface Tier {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWriteLongTTL?: number;
}
interface Row extends Tier {
  id: string;
  longContext?: Tier & { aboveTokens: number };
}

/** Input, cache-read, write and long-TTL write with the documented fallbacks. */
const cacheRates = (t: Tier): [number, number, number, number] => {
  const write = t.cacheWrite ?? t.input;
  return [t.input, t.cacheRead ?? t.input, write, t.cacheWriteLongTTL ?? write];
};
const rows: Row[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../conformance/pricing.json', import.meta.url)), 'utf8'),
).models;

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-12);

describe('conformance: pricing.json', () => {
  it('every row is a key of the built-in table', () => {
    expect(pricedModels().length).toBe(rows.length);
  });

  for (const r of rows) {
    it(`${r.id} prices as the vendor page says`, () => {
      close(estimateCost(r.id, 1000, 1000), (r.input + r.output) / 1000);
      if (!r.longContext) return;
      const at = r.longContext.aboveTokens;
      // Exactly at the threshold is still the base rate; one over pays the long rates on everything.
      close(estimateCost(r.id, at, 1000), (at * r.input + 1000 * r.output) / 1e6);
      close(estimateCost(r.id, at + 1, 1000), ((at + 1) * r.longContext.input + 1000 * r.longContext.output) / 1e6);
    });
  }

  for (const r of rows) {
    it(`${r.id} cache rates as the vendor page says`, () => {
      // 1,000 fresh + 2,000 read + 3,000 written (1,000 of them at the long TTL).
      let [inp, read, write, writeLong] = cacheRates(r);
      const base = { inputTokens: 6000, outputTokens: 0, cacheReadTokens: 2000, cacheWriteTokens: 3000, cacheWriteLongTTLTokens: 1000 };
      close(estimateUsageCost(r.id, base), (1000 * inp + 2000 * read + 2000 * write + 1000 * writeLong) / 1e6);
      if (!r.longContext) return;
      // The tier is chosen on the whole prompt, cached parts included.
      const at = r.longContext.aboveTokens;
      [inp, read, write, writeLong] = cacheRates(r.longContext);
      close(
        estimateUsageCost(r.id, { ...base, inputTokens: at + 1 }),
        ((at + 1 - 5000) * inp + 2000 * read + 2000 * write + 1000 * writeLong) / 1e6,
      );
    });
  }

  it("a caller's price without cache rates bills cache tokens at the input rate", () => {
    const usage = { inputTokens: 3000, outputTokens: 0, cacheReadTokens: 1000, cacheWriteTokens: 1000, cacheWriteLongTTLTokens: 500 };
    close(estimateUsageCostWith(new StaticPricing({ m: { promptUSDPer1K: 1, completionUSDPer1K: 2 } }), 'm', usage), 3);
    const cached = new StaticPricing({
      m: { promptUSDPer1K: 1, completionUSDPer1K: 2, cacheReadUSDPer1K: 0.1, cacheWriteUSDPer1K: 1.25, cacheWriteLongTTLUSDPer1K: 2 },
    });
    close(estimateUsageCostWith(cached, 'm', usage), 1 + 0.1 + 0.625 + 1);
  });

  it('the models people actually run are never priced at $0', () => {
    for (const id of [
      'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1',
      'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001',
      'gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.5', 'gpt-5.4-mini-2026-03-17',
      'gemini-4-argon', 'gemini-3.1-pro-preview', 'gemini-2.5-flash',
      'deepseek-v4-pro', 'deepseek-flash',
    ]) {
      expect(estimateCost(id, 1000, 1000), id).toBeGreaterThan(0);
    }
  });

  it('gpt-4o-2024-05-13 keeps its own price; other gpt-4o snapshots do not', () => {
    close(estimateCost('gpt-4o-2024-05-13', 1000, 1000), (5 + 15) / 1000);
    close(estimateCost('gpt-4o-2024-08-06', 1000, 1000), (2.5 + 10) / 1000);
  });

  it("a caller's price is applied flat; the built-in long tier never overrides it", () => {
    const p = new StaticPricing({ 'claude-haiku-5-5': { promptUSDPer1K: 1, completionUSDPer1K: 1 } });
    close(estimateCostWith(p, 'claude-haiku-5-5', 200_000, 0), 200);
  });
});
