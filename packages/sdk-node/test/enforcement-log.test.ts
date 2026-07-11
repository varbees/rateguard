import { describe, it, expect } from 'vitest';
import { RateGuard } from '../src/index.js';

const okResponse = () =>
  new Response(
    JSON.stringify({ model: 'gpt-4o', usage: { prompt_tokens: 400, completion_tokens: 100, total_tokens: 500 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

function send(wrapped: typeof fetch, customer?: string) {
  return wrapped('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o' }),
    ...(customer ? { headers: { 'X-RateGuard-Customer': customer } } : {}),
  });
}

describe('enforcement log', () => {
  it('records budget stops and freezes, newest first, with timestamps', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 600 } });
    const wrapped = rg.wrapFetch({ estimatedTokens: 500, fetch: (async () => okResponse()) as typeof fetch });

    await send(wrapped, 'alice'); // 500 used
    await send(wrapped, 'alice'); // 1000 used
    await send(wrapped, 'alice'); // blocked -> token_budget_exceeded
    rg.freeze('bob');
    await send(wrapped, 'bob'); // frozen

    const events = rg.enforcementEvents(0);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]!.type).toBe('frozen'); // newest first
    expect(events[0]!.customer).toBe('bob');
    expect(events.some((e) => e.type === 'token_budget_exceeded' && e.customer === 'alice')).toBe(true);
    expect(events[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });
});
