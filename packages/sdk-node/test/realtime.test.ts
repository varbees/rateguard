/**
 * Realtime session enforcement — mirrors Go's realtime_session_test.go.
 * Conformance cases include REAL Gemini Live frames captured from the
 * live API (2026-07-10).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RealtimeSessionGuard,
  emptyRealtimeUsage,
  parseRealtimeEvent,
  type RealtimeEvent,
  type RealtimeProviderName,
  type RealtimeUsage,
} from '../src/core/realtime.js';

const VECTORS_PATH = join(__dirname, '..', '..', '..', 'conformance', 'realtime_usage_vectors.json');

interface VectorCase {
  name: string;
  provider: RealtimeProviderName;
  event: unknown;
  expect: {
    type: string;
    turn_complete: boolean;
    has_usage: boolean;
    usage?: Record<string, number>;
  };
}

function loadVectors(): VectorCase[] {
  return (JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as { cases: VectorCase[] }).cases;
}

// snake_case golden keys → camelCase RealtimeUsage keys.
const USAGE_KEY: Record<string, keyof RealtimeUsage> = {
  input_tokens: 'inputTokens',
  output_tokens: 'outputTokens',
  total_tokens: 'totalTokens',
  input_text_tokens: 'inputTextTokens',
  input_audio_tokens: 'inputAudioTokens',
  input_cached_tokens: 'inputCachedTokens',
  output_text_tokens: 'outputTextTokens',
  output_audio_tokens: 'outputAudioTokens',
  thoughts_tokens: 'thoughtsTokens',
};

describe('realtime usage conformance', () => {
  const cases = loadVectors();
  it('has cases', () => expect(cases.length).toBeGreaterThan(0));

  for (const c of cases) {
    it(c.name, () => {
      const ev = parseRealtimeEvent(c.provider, JSON.stringify(c.event));
      expect(ev.type).toBe(c.expect.type);
      expect(ev.turnComplete).toBe(c.expect.turn_complete);
      expect(ev.usage !== undefined).toBe(c.expect.has_usage);
      if (c.expect.usage) {
        for (const [k, want] of Object.entries(c.expect.usage)) {
          expect(ev.usage![USAGE_KEY[k]!], `${c.name}: ${k}`).toBe(want);
        }
      }
    });
  }
});

function usageEvent(opts: { total?: number; inAudio?: number; outAudio?: number; turnComplete?: boolean }): RealtimeEvent {
  const usage = emptyRealtimeUsage();
  usage.totalTokens = opts.total ?? 0;
  usage.inputAudioTokens = opts.inAudio ?? 0;
  usage.outputAudioTokens = opts.outAudio ?? 0;
  return { provider: 'openai', type: 'response.done', turnComplete: opts.turnComplete ?? true, usage };
}

describe('RealtimeSessionGuard', () => {
  it('sums usage and trips on total tokens, terminal, fires once', () => {
    const fired: unknown[] = [];
    const g = new RealtimeSessionGuard('openai', {
      limits: { maxTotalTokens: 1000 },
      onExceeded: (d) => fired.push(d),
    });

    let d = g.observeEvent(usageEvent({ total: 400 }));
    expect(d.exceeded).toBe(false);
    expect(d.totals.totalTokens).toBe(400);
    expect(d.turns).toBe(1);

    d = g.observeEvent(usageEvent({ total: 400 }));
    expect(d.exceeded).toBe(false); // 800 <= 1000

    d = g.observeEvent(usageEvent({ total: 400 }));
    expect(d.exceeded).toBe(true);
    expect(d.reason).toBe('total_tokens');
    expect(d.totals.totalTokens).toBe(1200);
    expect(fired).toHaveLength(1);

    d = g.observeEvent(usageEvent({ total: 1, turnComplete: false }));
    expect(d.exceeded).toBe(true); // terminal
    expect(fired).toHaveLength(1); // no re-fire
  });

  it('trips on audio tokens', () => {
    const g = new RealtimeSessionGuard('gemini', { limits: { maxAudioTokens: 100 } });
    expect(g.observeEvent(usageEvent({ inAudio: 60, outAudio: 30 })).exceeded).toBe(false); // 90
    const d = g.observeEvent(usageEvent({ inAudio: 6, outAudio: 6 })); // 102
    expect(d.exceeded).toBe(true);
    expect(d.reason).toBe('audio_tokens');
  });

  it('accounts cost with cached-input split and trips on cost', () => {
    const g = new RealtimeSessionGuard('openai', {
      limits: { maxEstimatedCostMicroUSD: 100_000 }, // $0.10
      costRates: { inputAudioPerMTokens: 32_000_000, outputAudioPerMTokens: 64_000_000 },
    });
    let d = g.observeEvent(usageEvent({ inAudio: 1000, outAudio: 1000 }));
    expect(d.exceeded).toBe(false);
    expect(d.estimatedCostMicroUSD).toBe(96_000);
    d = g.observeEvent(usageEvent({ inAudio: 200 }));
    expect(d.exceeded).toBe(true);
    expect(d.reason).toBe('cost');
    expect(d.estimatedCostMicroUSD).toBe(102_400);

    // 400 uncached × $4/M + 600 cached × $0.4/M = 1840 µ$.
    const g2 = new RealtimeSessionGuard('openai', {
      costRates: { inputTextPerMTokens: 4_000_000, inputCachedPerMTokens: 400_000 },
    });
    const usage = emptyRealtimeUsage();
    usage.inputTextTokens = 1000;
    usage.inputCachedTokens = 600;
    const d2 = g2.observeEvent({ provider: 'openai', type: 'response.done', turnComplete: false, usage });
    expect(d2.estimatedCostMicroUSD).toBe(1_840);
  });

  it('duration via tick; peek is pure and derived', () => {
    let now = 1_780_000_000_000;
    let fired = 0;
    const g = new RealtimeSessionGuard('openai', {
      limits: { maxDurationMs: 60_000 },
      onExceeded: () => fired++,
      clock: { now: () => now },
    });
    now += 120_000;

    let p = g.peek();
    expect(p.exceeded).toBe(true);
    expect(p.reason).toBe('duration');
    expect(fired).toBe(0); // peek must never fire

    p = g.peek(); // repeatable
    expect(p.exceeded).toBe(true);
    expect(fired).toBe(0);

    const d = g.tick();
    expect(d.exceeded).toBe(true);
    expect(d.reason).toBe('duration');
    expect(fired).toBe(1);
    g.tick();
    expect(fired).toBe(1); // no re-fire
  });

  it('observeRaw end-to-end with the real captured Gemini frame', () => {
    const frame = JSON.stringify(
      loadVectors().find((c) => c.provider === 'gemini' && c.expect.has_usage)!.event,
    );
    const g = new RealtimeSessionGuard('gemini', { limits: { maxTotalTokens: 500 } });

    const first = g.observeRaw(frame);
    expect(first.event.usage).toBeDefined();
    expect(first.decision.totals.totalTokens).toBe(393);
    expect(first.decision.turns).toBe(1);
    expect(first.decision.exceeded).toBe(false);

    const second = g.observeRaw(frame);
    expect(second.decision.exceeded).toBe(true);
    expect(second.decision.reason).toBe('total_tokens');
    expect(second.decision.totals.totalTokens).toBe(786);

    expect(() => g.observeRaw('not json')).toThrow();
  });
});
