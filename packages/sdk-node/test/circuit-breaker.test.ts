import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';

const clock = {
  now: () => current,
};

let current = 1_000;

describe('CircuitBreaker', () => {
  it('transitions closed -> open -> half-open -> closed', () => {
    current = 1_000;
    const breaker = new CircuitBreaker(clock, {
      errorRateThreshold: 0.5,
      openTimeoutMs: 60_000,
      halfOpenSuccessesRequired: 2,
      sampleSize: 100,
    });

    for (let index = 0; index < 10; index += 1) {
      breaker.recordOutcome(false);
    }

    expect(breaker.getState()).toBe('open');

    current += 60_001;
    expect(breaker.allow().state).toBe('half-open');
    expect(breaker.allow().allowed).toBe(false);

    breaker.recordOutcome(true);
    const probe = breaker.allow();
    expect(probe.allowed).toBe(true);
    breaker.recordOutcome(true);
    expect(breaker.getState()).toBe('closed');
  });
});
