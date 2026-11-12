/**
 * USD budgets (0.6, docs/specs/0.6-usd-budgets.md).
 *
 * Money is integer micro-USD everywhere after config load. Two float steps are
 * DEFINED as IEEE-754 double operations, identical in Go, Node and Python:
 *
 *   usdToMicro(usd)          = floor(usd * 1e6 + 0.5)
 *   rateMicroPerM(usdPer1K)  = floor(usdPer1K * 1e9 + 0.5)   // micro-USD per 1M tokens
 *
 * Everything after that is exact integer arithmetic, rounded UP once:
 *
 *   reserve = ceil((prompt * max(input, cacheWrite, cacheWriteLongTTL) + output * output) / 1e6)
 *   cost    = ceil((fresh*input + read*cacheRead + (write-writeLong)*cacheWrite
 *                   + writeLong*cacheWriteLongTTL + output*output) / 1e6)
 *
 * The reservation prices every prompt token at the HIGHEST input rate the call
 * could be billed at, so a cache-write premium can never push the real cost
 * past what was reserved. conformance/usd_budget_vectors.json pins all of it.
 *
 * These are estimates from RateGuard's price table, not the provider's
 * invoice. Every surface says "estimated".
 */
import type { ModelPrice, UsageForCost } from './genai.js';

export type USDBudgetScope = 'tenant' | 'customer' | 'model';
export type USDBudgetUnpriced = 'deny' | 'allow-uncounted';

/** Integer micro-USD per 1M tokens. */
export interface MicroRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWriteLongTTL: number;
}

export const MICRO_PER_USD = 1_000_000;

/** USD (decimal) to integer micro-USD. Throws on a negative or non-finite amount. */
export function usdToMicro(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`rateguard: USD amount must be a finite number >= 0, got ${usd}`);
  }
  return Math.floor(usd * 1e6 + 0.5);
}

function rateMicroPerM(usdPer1K: number | undefined): number {
  return usdPer1K !== undefined && usdPer1K > 0 ? Math.floor(usdPer1K * 1e9 + 0.5) : 0;
}

/**
 * A ModelPrice as integer micro-USD per 1M tokens. A missing cache read or write
 * rate bills at the input rate; a missing long-TTL write rate at the write rate.
 */
export function microRates(price: ModelPrice): MicroRates {
  const input = rateMicroPerM(price.promptUSDPer1K);
  const output = rateMicroPerM(price.completionUSDPer1K);
  const cacheRead = rateMicroPerM(price.cacheReadUSDPer1K) || input;
  const cacheWrite = rateMicroPerM(price.cacheWriteUSDPer1K) || input;
  const cacheWriteLongTTL = rateMicroPerM(price.cacheWriteLongTTLUSDPer1K) || cacheWrite;
  return { input, output, cacheRead, cacheWrite, cacheWriteLongTTL };
}

/** ceil(n / 1e6) for a non-negative integer n, exact for n < 2^53. */
function ceilMicro(n: number): number {
  let q = Math.floor(n / MICRO_PER_USD);
  while (q * MICRO_PER_USD > n) q -= 1;
  while ((q + 1) * MICRO_PER_USD <= n) q += 1;
  return q * MICRO_PER_USD === n ? q : q + 1;
}

const nonNeg = (n: number | undefined) => (n !== undefined && n > 0 ? Math.floor(n) : 0);

/** The micro-USD to hold for a call before it is sent. */
export function reserveMicroUSD(rates: MicroRates, promptTokens: number, outputTokens: number): number {
  const inRate = Math.max(rates.input, rates.cacheWrite, rates.cacheWriteLongTTL);
  return ceilMicro(nonNeg(promptTokens) * inRate + nonNeg(outputTokens) * rates.output);
}

/** The estimated micro-USD a call actually cost, from its measured usage. */
export function costMicroUSD(rates: MicroRates, usage: UsageForCost): number {
  const read = nonNeg(usage.cacheReadTokens);
  const write = nonNeg(usage.cacheWriteTokens);
  const writeLong = Math.min(nonNeg(usage.cacheWriteLongTTLTokens), write);
  const fresh = Math.max(nonNeg(usage.inputTokens) - read - write, 0);
  return ceilMicro(
    fresh * rates.input +
      read * rates.cacheRead +
      (write - writeLong) * rates.cacheWrite +
      writeLong * rates.cacheWriteLongTTL +
      nonNeg(usage.outputTokens) * rates.output,
  );
}

/**
 * The budget key a call draws from. Dollars are comparable across models, so the
 * default scope ('customer') drops provider and model; 'model' keeps them, for
 * parity with token budgets.
 */
export function usdBudgetKey(scope: USDBudgetScope, tenant: string, customer: string | undefined, provider: string, model: string | undefined): string {
  const cust = customer ? `:customer=${customer}` : '';
  if (scope === 'tenant') return `${tenant}:usd`;
  if (scope === 'model') return `${tenant}${cust}:${provider}:${model || 'default'}:usd`;
  return `${tenant}${cust}:usd`;
}
