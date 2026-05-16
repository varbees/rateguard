import { describe, expect, it, vi } from 'vitest';
import { TokenBudgetManager } from '../src/core/token-budget.js';

const clock = {
  now: () => 1_000,
};

describe('TokenBudgetManager', () => {
  it('hard-stops after the rolling monthly limit is reached', () => {
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';
    budget.record(key, 10);

    const decision = budget.check(key, {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 10,
      mode: 'hard-stop',
      softStopAt: 0.8,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it('soft-stops with a warning once the threshold is crossed', () => {
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';
    budget.record(key, 8);

    const decision = budget.check(key, {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 10,
      mode: 'soft-stop',
      softStopAt: 0.8,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.warning).toBe(true);
  });

  it('records token usage from response headers before body parsing', () => {
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';

    const usage = budget.recordFromSnapshot(key, {
      headers: {
        'x-rateguard-provider': 'openai',
        'x-rateguard-model': 'gpt-4.1',
        'x-rateguard-input-tokens': '2',
        'x-rateguard-output-tokens': '3',
        'x-rateguard-total-tokens': '5',
      },
      body: '',
      statusCode: 200,
    });

    expect(usage?.provider).toBe('openai');
    expect(usage?.model).toBe('gpt-4.1');
    expect(usage?.totalTokens).toBe(5);
    expect(budget.usage(key, {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 10,
      mode: 'hard-stop',
      softStopAt: 0.8,
    }).month).toBe(5);
  });

  it('logs malformed JSON token usage payloads instead of hiding parser failures', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
      const usage = budget.recordFromSnapshot('tenant:route:upstream:GET', {
        headers: {},
        body: '{"usage":{"total_tokens":7}',
        statusCode: 200,
      });

      expect(usage).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'RateGuard failed to parse token usage JSON payload',
        expect.any(SyntaxError),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
