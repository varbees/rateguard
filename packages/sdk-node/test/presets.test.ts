import { describe, expect, it } from 'vitest';
import { deriveWsUrl, knownPresets, normalizePreset, presetPolicy } from '../src/config.js';

describe('presets', () => {
  it('normalizes historical preset aliases', () => {
    expect(normalizePreset('starter')).toBe('standard');
    expect(normalizePreset('business')).toBe('llm-heavy');
  });

  it('returns the canonical preset policy values', () => {
    const policy = presetPolicy('standard');
    expect(policy.requestsPerSecond).toBe(100);
    expect(policy.burst).toBe(200);
    expect(policy.monthlyRequestLimit).toBe(1_000_000);
  });

  it('lists known presets', () => {
    expect(knownPresets()).toEqual([
      'dev',
      'standard',
      'high-throughput',
      'llm-heavy',
      'strict-upstream-protection',
    ]);
  });

  it('rejects malformed control-plane URLs instead of disabling websocket events', () => {
    expect(() => deriveWsUrl('control.example')).toThrow(/Invalid RateGuard controlPlaneUrl/);
  });
});
