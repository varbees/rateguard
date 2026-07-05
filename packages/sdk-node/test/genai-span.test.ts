import { describe, expect, it } from 'vitest';
import { startGenAICall } from '../src/core/genai-span.js';
import { estimateCost } from '../src/core/genai.js';

function fakeClock(startMs: number) {
  let now = startMs;
  return {
    clock: { now: () => now },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('GenAISpan', () => {
  it('computes TTFT/TPOT from recorded chunks and falls back to estimateCost when no cost is given', () => {
    const { clock, advance } = fakeClock(1_000);
    const span = startGenAICall(clock, { provider: 'openai', model: 'gpt-4o', operation: 'chat' });

    advance(50); // time to first chunk
    span.recordChunk();
    advance(30);
    span.recordChunk();
    advance(20);
    span.recordChunk();
    // total latency: 100ms across 3 chunks

    const call = span.end({ promptTokens: 100, completionTokens: 50 });

    expect(call.streaming).toBe(true);
    expect(call.streamChunks).toBe(3);
    expect(call.timeToFirstChunkMs).toBe(50);
    expect(call.timePerOutputChunkMs).toBeCloseTo(100 / 3, 10);
    expect(call.totalTokens).toBe(150); // not given -> promptTokens + completionTokens
    expect(call.estimatedCostUSD).toBeCloseTo(estimateCost('gpt-4o', 100, 50), 10);
    expect(call.estimatedCostUSD).toBeGreaterThan(0);
  });

  it('leaves streaming false and TTFT/TPOT at zero when no chunks were recorded', () => {
    const { clock, advance } = fakeClock(0);
    const span = startGenAICall(clock, { provider: 'anthropic', model: 'claude-sonnet-4' });
    advance(200);
    const call = span.end({ promptTokens: 10, completionTokens: 5 });

    expect(call.streaming).toBe(false);
    expect(call.streamChunks).toBe(0);
    expect(call.timeToFirstChunkMs).toBe(0);
    expect(call.timePerOutputChunkMs).toBe(0);
    expect(call.totalTokens).toBe(15);
  });

  it('explicit final fields win over the computed/start-time values', () => {
    const { clock, advance } = fakeClock(0);
    const span = startGenAICall(clock, { provider: 'openai', model: 'gpt-4o' });
    advance(10);
    span.recordChunk();
    advance(10);
    span.recordChunk();

    const call = span.end({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 999,
      estimatedCostUSD: 0.5,
      streamChunks: 42,
      timeToFirstChunkMs: 12_345,
      timePerOutputChunkMs: 6_789,
    });

    expect(call.totalTokens).toBe(999);
    expect(call.estimatedCostUSD).toBe(0.5);
    expect(call.streamChunks).toBe(42);
    expect(call.timeToFirstChunkMs).toBe(12_345);
    expect(call.timePerOutputChunkMs).toBe(6_789);
  });

  it('does not fabricate a cost for an unpriced model', () => {
    const { clock } = fakeClock(0);
    const span = startGenAICall(clock, { provider: 'self-hosted', model: 'totally-unpriced-model' });
    const call = span.end({ promptTokens: 100, completionTokens: 100 });
    expect(call.estimatedCostUSD).toBe(0);
  });

  it('end() is idempotent: a second call returns the same merged result, ignoring new args', () => {
    const { clock } = fakeClock(0);
    const span = startGenAICall(clock, { provider: 'openai', model: 'gpt-4o' });

    const first = span.end({ promptTokens: 1, completionTokens: 1 });
    const second = span.end({ promptTokens: 999, completionTokens: 999 });

    expect(second).toEqual(first);
  });

  it('invokes the observer with start and end attributes', () => {
    const { clock } = fakeClock(0);
    const starts: Array<Record<string, unknown>> = [];
    const ends: Array<Record<string, unknown>> = [];

    const span = startGenAICall(
      clock,
      { provider: 'openai', model: 'gpt-4o' },
      {
        onSpanStart: (attrs) => starts.push(attrs),
        onSpanEnd: (attrs) => ends.push(attrs),
      },
    );
    span.end({ promptTokens: 1, completionTokens: 1 });

    expect(starts).toHaveLength(1);
    expect(starts[0]?.['gen_ai.request.model']).toBe('gpt-4o');
    expect(ends).toHaveLength(1);
    expect(ends[0]?.['gen_ai.usage.input_tokens']).toBe(1);
  });

  it('records error.type on the end attributes when the call failed', () => {
    const { clock } = fakeClock(0);
    const ends: Array<Record<string, unknown>> = [];
    const span = startGenAICall(clock, { provider: 'openai', model: 'gpt-4o' }, { onSpanEnd: (attrs) => ends.push(attrs) });

    span.end({}, new TypeError('boom'));

    expect(ends[0]?.['error.type']).toBe('TypeError');
  });
});
