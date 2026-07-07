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

    breaker.recordOutcome(true);
    expect(breaker.getState()).toBe('closed');
  });

  it('releaseProbe unwedges a half-open probe that never got an outcome recorded', () => {
    // Reproduces the bug this SDK shipped with: a half-open probe granted
    // by allow() that never got recordOutcome called on it (because it was
    // denied by something other than the upstream call) used to leak
    // forever, permanently wedging the breaker. releaseProbe must clear it
    // without counting as a success or a failure.
    current = 1_000;
    const breaker = new CircuitBreaker(clock, {
      errorRateThreshold: 0.5,
      openTimeoutMs: 1_000,
      halfOpenSuccessesRequired: 1,
      sampleSize: 10,
    });

    for (let index = 0; index < 10; index += 1) {
      breaker.recordOutcome(false);
    }
    expect(breaker.getState()).toBe('open');

    current += 2_000;
    const probe = breaker.allow();
    expect(probe.allowed).toBe(true);
    expect(probe.probeInFlight).toBe(true);

    // Simulate the probe request getting denied by an unrelated gate
    // before it ever reaches upstream — nothing calls recordOutcome.
    // Without releaseProbe, every future allow() would report
    // probeInFlight forever.
    const stuck = breaker.allow();
    expect(stuck.allowed).toBe(false);
    expect(stuck.probeInFlight).toBe(true);

    breaker.releaseProbe();

    const freed = breaker.allow();
    expect(freed.allowed).toBe(true);
    expect(freed.probeInFlight).toBe(true);
    expect(breaker.recordOutcome(true).state).toBe('closed');
  });

  it('normalizes invalid options', () => {
    current = 1_000;
    const breaker = new CircuitBreaker(clock, {
      errorRateThreshold: 2,
      openTimeoutMs: 0,
      halfOpenSuccessesRequired: 0,
      sampleSize: 0,
    });

    for (let index = 0; index < 10; index += 1) {
      breaker.recordOutcome(false);
    }

    expect(breaker.getState()).toBe('open');
  });
});
