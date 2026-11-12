import { describe, expect, it } from 'vitest';

import { RateGuard, StaticPricing, type RateGuardOptions } from '../src/index.js';

// USD budgets (0.6) through the public surface: wrapFetch + usdBudgetState.
// Prices are a caller PricingProvider so no test depends on the shipped table.
// "vec-full": $3/M input, $15/M output, $0.30/M cache read, $3.75/M cache write, $6/M long write.

const pricing = new StaticPricing({
  'vec-full': {
    promptUSDPer1K: 0.003,
    completionUSDPer1K: 0.015,
    cacheReadUSDPer1K: 0.0003,
    cacheWriteUSDPer1K: 0.00375,
    cacheWriteLongTTLUSDPer1K: 0.006,
  },
  'vec-cheap': { promptUSDPer1K: 0.00015, completionUSDPer1K: 0.0006 },
});

const URL_OPENAI = 'https://api.openai.com/v1/chat/completions';

const okBody = (model: string, prompt: number, completion: number) =>
  JSON.stringify({ id: 'c', model, choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion } });

// The fake provider answers for the model the request asked for, as a real one does.
const echo = (init?: RequestInit) => {
  const model = (JSON.parse(String(init?.body ?? '{}')) as { model?: string }).model ?? 'vec-full';
  return new Response(okBody(model, 1000, 200), { status: 200, headers: { 'content-type': 'application/json' } });
};

function setup(usdBudget: RateGuardOptions['usdBudget'], respond: (init?: RequestInit) => Response = echo) {
  const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 0, dayLimit: 0, monthLimit: 0 }, pricingProvider: pricing, ...(usdBudget ? { usdBudget } : {}) });
  let upstream = 0;
  const wrapped = rg.wrapFetch({
    fetch: (async (_url: unknown, init?: RequestInit) => {
      upstream += 1;
      return respond(init);
    }) as typeof fetch,
  });
  const call = (model = 'vec-full', customer?: string, maxTokens = 200) =>
    wrapped(URL_OPENAI, {
      method: 'POST',
      headers: customer ? { 'x-rateguard-customer': customer } : {},
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: 'hello there' }] }),
    });
  return { rg, call, upstream: () => upstream };
}

describe('USD budget through wrapFetch', () => {
  it('commits the measured cost in micro-USD', async () => {
    const { rg, call } = setup({ dayLimitUSD: 1 });
    const res = await call();
    expect(res.status).toBe(200);
    // 1000 prompt * $3/M + 200 output * $15/M = $0.003 + $0.003 = 6,000 micro-USD
    const s = rg.usdBudgetState();
    expect(s.applied).toBe(true);
    expect(s.limitMicroUSD).toBe(1_000_000);
    expect(s.remainingMicroUSD).toBe(1_000_000 - 6_000);
    expect(s.key).toBe(`${rg.runtime.config.tenantId}:usd`);
  });

  it('denies before the network once the budget is spent', async () => {
    const { rg, call, upstream } = setup({ dayLimitUSD: 0.005 }); // 5,000 micro
    expect((await call()).status).toBe(200); // reserves what is left, then settles 6,000
    expect(rg.usdBudgetState().remainingMicroUSD).toBe(0);
    const denied = await call();
    expect(denied.status).toBe(429);
    const body = (await denied.json()) as { error: { type: string; message: string } };
    expect(body.error.type).toBe('usd_budget_exceeded');
    expect(body.error.message).toContain('estimated USD budget');
    expect(upstream()).toBe(1);
    expect(rg.enforcementEvents(1)[0]!.type).toBe('usd_budget_exceeded');
  });

  it('denies a model it cannot price, by default', async () => {
    const { rg, call, upstream } = setup({ dayLimitUSD: 1 });
    const res = await call('mystery-model-9');
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { type: string } }).error.type).toBe('usd_price_unknown');
    expect(upstream()).toBe(0);
    expect(rg.usdBudgetState().remainingMicroUSD).toBe(1_000_000);
  });

  it("lets an unpriced model through under 'allow-uncounted', and says so every time", async () => {
    const { rg, call, upstream } = setup({ dayLimitUSD: 1, unpriced: 'allow-uncounted' });
    expect((await call('mystery-model-9')).status).toBe(200);
    expect((await call('mystery-model-9')).status).toBe(200);
    expect(upstream()).toBe(2);
    expect(rg.usdBudgetState().remainingMicroUSD).toBe(1_000_000);
    expect(rg.enforcementEvents().filter((e) => e.type === 'usd_unpriced_call')).toHaveLength(2);
  });

  it("scope 'customer' shares one key across models and splits customers", async () => {
    const { rg, call } = setup({ dayLimitUSD: 1 });
    await call('vec-full', 'acme');
    await call('vec-cheap', 'acme');
    await call('vec-full', 'globex');
    // vec-cheap is billed off the response usage (1000 + 200 tokens) at its own rates: 150 + 120 = 270 micro
    expect(rg.usdBudgetState({ customer: 'acme' }).remainingMicroUSD).toBe(1_000_000 - 6_000 - 270);
    expect(rg.usdBudgetState({ customer: 'globex' }).remainingMicroUSD).toBe(1_000_000 - 6_000);
  });

  it("scope 'model' keeps a key per provider and model", async () => {
    const { rg, call } = setup({ dayLimitUSD: 1, scope: 'model' });
    await call('vec-full');
    expect(rg.usdBudgetState({ provider: 'openai', model: 'vec-full' }).remainingMicroUSD).toBe(1_000_000 - 6_000);
    expect(rg.usdBudgetState({ provider: 'openai', model: 'vec-cheap' }).remainingMicroUSD).toBe(1_000_000);
  });

  it('releases the reservation when the provider fails', async () => {
    const { rg, call } = setup({ dayLimitUSD: 1 }, () => new Response('boom', { status: 500 }));
    expect((await call()).status).toBe(500);
    expect(rg.usdBudgetState().remainingMicroUSD).toBe(1_000_000);
  });

  it('commits the reservation when a stream reports no usage', async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
    const { rg, call } = setup({ dayLimitUSD: 1 }, () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const res = await call('vec-full', undefined, 1000);
    await res.text();
    await new Promise((r) => setTimeout(r, 10));
    const spent = 1_000_000 - rg.usdBudgetState().remainingMicroUSD;
    // the reservation: prompt priced at the dearest input rate ($6/M) + 1000 output * $15/M; at least the output side
    expect(spent).toBeGreaterThanOrEqual(15_000);
  });

  it('observe mode never denies, and still meters', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 0, dayLimit: 0, monthLimit: 0 }, pricingProvider: pricing, usdBudget: { dayLimitUSD: 0.001 } });
    const wrapped = rg.wrapFetch({ mode: 'observe', fetch: (async () => new Response(okBody('vec-full', 1000, 200), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch });
    const req = () => wrapped(URL_OPENAI, { method: 'POST', body: JSON.stringify({ model: 'vec-full', max_tokens: 200, messages: [] }) });
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(200);
    expect(rg.usdBudgetState().allowed).toBe(false);
  });

  it('soft-stop warns and never denies', async () => {
    const { rg, call } = setup({ dayLimitUSD: 0.007, mode: 'soft-stop' });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect(rg.usdBudgetState().warning).toBe(true);
  });

  it('peeking never reserves (rule 10)', async () => {
    const { rg } = setup({ dayLimitUSD: 1 });
    for (let i = 0; i < 5; i += 1) rg.usdBudgetState({ customer: 'acme' });
    expect(rg.usdBudgetState({ customer: 'acme' }).remainingMicroUSD).toBe(1_000_000);
  });
});

describe('USD budget config', () => {
  it('is off unless a limit is set', () => {
    expect(new RateGuard({ preset: 'dev' }).usdBudgetState().applied).toBe(false);
    expect(new RateGuard({ preset: 'dev', usdBudget: {} }).usdBudgetState().applied).toBe(false);
  });
  it('rejects negative or non-finite limits and unknown options', () => {
    expect(() => new RateGuard({ usdBudget: { dayLimitUSD: -1 } })).toThrow('USD amount');
    expect(() => new RateGuard({ usdBudget: { dayLimitUSD: Number.NaN } })).toThrow('USD amount');
    expect(() => new RateGuard({ usdBudget: { dayLimitUSD: 1, scope: 'galaxy' as 'tenant' } })).toThrow('scope');
    expect(() => new RateGuard({ usdBudget: { dayLimitUSD: 1, unpriced: 'maybe' as 'deny' } })).toThrow('unpriced');
  });
});
