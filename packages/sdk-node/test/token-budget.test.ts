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

  it('blocks at exactly the hourly cap, not one token past it', () => {
    // The boundary is load-bearing and was undefended: mutation testing
    // (scripts/mutate.py, node/budget-boundary-off-by-one) flipped the hour
    // check from `used >= limit` to `used > limit` and NO test noticed. Every
    // budget test either used hourLimit:0 (disabled) or exercised the month
    // window, so the exact-cap hour boundary — where >= and > disagree — was
    // never asserted. `>` there is a one-token overspend on every budget,
    // forever. This pins it: usage exactly at the cap must block.
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';
    budget.record(key, 100); // exactly the limit

    const atCap = budget.check(key, {
      hourLimit: 100,
      dayLimit: 0,
      monthLimit: 0,
      mode: 'hard-stop',
      softStopAt: 0.8,
    });
    expect(atCap.allowed, 'usage exactly at the hourly cap must block').toBe(false);

    // And one below the cap must still pass, or `>=` would be over-strict.
    const belowCap = new TokenBudgetManager({ clock, capacity: 50_000 });
    belowCap.record(key, 99);
    expect(
      belowCap.check(key, { hourLimit: 100, dayLimit: 0, monthLimit: 0, mode: 'hard-stop', softStopAt: 0.8 }).allowed,
      'usage one below the cap must be allowed',
    ).toBe(true);
  });

  it('reserves hard-budget capacity to prevent concurrent double spend', () => {
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';
    const options = {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 100,
      mode: 'hard-stop' as const,
      softStopAt: 0.8,
    };

    const first = budget.reserve(key, options);
    expect(first.decision.allowed).toBe(true);
    expect(first.reservationId).toBeDefined();

    const second = budget.reserve(key, options);
    expect(second.decision.allowed).toBe(false);

    budget.commitReservation(key, first.reservationId, 17);
    expect(budget.check(key, options).remaining).toBe(83);
  });

  it('estimate-based reservation lets two concurrent same-key requests both succeed when estimate < remaining/2', () => {
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';
    const options = {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 100,
      mode: 'hard-stop' as const,
      softStopAt: 0.8,
    };

    // remaining is 100; an estimate of 10 (< 100/2) should reserve only 10,
    // leaving room for a second concurrent request on the same key.
    const first = budget.reserve(key, options, 10);
    expect(first.decision.allowed).toBe(true);
    expect(first.decision.remaining).toBe(90);
    expect(first.reservationId).toBeDefined();

    const second = budget.reserve(key, options, 10);
    expect(second.decision.allowed).toBe(true);
    expect(second.decision.remaining).toBe(80);
    expect(second.reservationId).toBeDefined();
    expect(second.reservationId).not.toBe(first.reservationId);
  });

  it('the old zero-estimate behavior still serializes concurrent requests on the same key', () => {
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';
    const options = {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 100,
      mode: 'hard-stop' as const,
      softStopAt: 0.8,
    };

    // No estimate (default / explicit 0) reserves the ENTIRE remaining
    // budget, so a second concurrent request on the same key is denied
    // until the first is committed or released.
    const first = budget.reserve(key, options);
    expect(first.decision.allowed).toBe(true);
    expect(first.decision.remaining).toBe(0);

    const second = budget.reserve(key, options, 0);
    expect(second.decision.allowed).toBe(false);
  });

  it('caps the reservation at the remaining budget when estimate exceeds it', () => {
    const budget = new TokenBudgetManager({ clock, capacity: 50_000 });
    const key = 'tenant:route:upstream:GET';
    const options = {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 100,
      mode: 'hard-stop' as const,
      softStopAt: 0.8,
    };

    const reservation = budget.reserve(key, options, 10_000);
    expect(reservation.decision.allowed).toBe(true);
    expect(reservation.decision.remaining).toBe(0);
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
