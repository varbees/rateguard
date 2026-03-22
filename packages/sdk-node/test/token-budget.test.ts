import { describe, expect, it } from 'vitest';
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
});
