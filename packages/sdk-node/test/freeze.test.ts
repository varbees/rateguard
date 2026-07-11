import { describe, it, expect } from 'vitest';
import { RateGuard } from '../src/index.js';

const okResponse = () =>
  new Response(
    JSON.stringify({ model: 'gpt-4o', usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

function send(wrapped: typeof fetch, customer?: string) {
  return wrapped('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o' }),
    ...(customer ? { headers: { 'X-RateGuard-Customer': customer } } : {}),
  });
}

describe('freeze kill switch', () => {
  it('global freeze halts, unfreeze resumes', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 100_000 } });
    const wrapped = rg.wrapFetch({ fetch: (async () => okResponse()) as typeof fetch });

    expect((await send(wrapped)).status).toBe(200);

    rg.freeze();
    expect(rg.isFrozen()).toBe(true);
    const blocked = await send(wrapped);
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('x-rateguard-synthesized')).toBe('true');

    rg.unfreeze();
    expect((await send(wrapped)).status).toBe(200);
  });

  it('per-customer freeze is scoped to that customer', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 100_000 } });
    const wrapped = rg.wrapFetch({ fetch: (async () => okResponse()) as typeof fetch });

    rg.freeze('alice');
    expect((await send(wrapped, 'alice')).status).toBe(403);
    expect((await send(wrapped, 'bob')).status).toBe(200);
    expect(rg.frozenScopes()).toEqual(['customer=alice']);
  });

  it('observe mode never blocks, even when frozen', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 100_000 } });
    const wrapped = rg.wrapFetch({ mode: 'observe', fetch: (async () => okResponse()) as typeof fetch });

    rg.freeze();
    expect((await send(wrapped)).status).toBe(200);
  });
});
