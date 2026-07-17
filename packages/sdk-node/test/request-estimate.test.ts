import { describe, it, expect } from 'vitest';
import {
  estimateRequestTokens,
  DEFAULT_OUTPUT_ALLOWANCE,
  MAX_ESTIMATE_BODY_BYTES,
} from '../src/core/request-estimate.js';

// Mirrors packages/sdk-go/request_estimate_test.go. The reservation used to be
// a flat 4096 for every call; these pin the measured replacement — especially
// that a long-context call now reserves what it will actually burn, which is
// the denial-of-wallet hole the constant left open.

const OLD_CONSTANT = 4096;

describe('estimateRequestTokens', () => {
  it('measures an OpenAI chat request as prompt + declared ceiling', () => {
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Explain quicksort.' },
      ],
      max_tokens: 500,
    });

    const got = estimateRequestTokens(body);
    expect(got).toBeGreaterThan(500); // the prompt rides on top of the ceiling
    expect(got).toBeLessThan(600);
  });

  // The regression that matters: the old flat 4096 under-reserved this by ~25x,
  // and overshoot is bounded by exactly how wrong the estimate is.
  it('reserves the real cost of a long-context call', () => {
    const context = 'the quick brown fox jumps over the lazy dog. '.repeat(9000);
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: context }],
      max_tokens: 1000,
    });

    const got = estimateRequestTokens(body);
    expect(got).toBeGreaterThan(OLD_CONSTANT);
    expect(got).toBeGreaterThan(90_000);
    expect(got).toBeLessThan(110_000);
  });

  it('counts an Anthropic system prompt beside messages', () => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4',
      system: 'You are terse.',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 2048,
    });
    expect(estimateRequestTokens(body)).toBeGreaterThan(2048);
  });

  it('reads the Gemini contents/systemInstruction shape', () => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: 'Explain gravity briefly.' }] }],
      systemInstruction: { parts: [{ text: 'Be concise.' }] },
      generationConfig: { maxOutputTokens: 256 },
    });

    const got = estimateRequestTokens(body);
    expect(got).toBeGreaterThan(256);
    expect(got).toBeLessThan(300);
  });

  it('counts the text part of a multimodal message', () => {
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ],
      max_tokens: 100,
    });
    // The text counts; the image does not (its cost is not derivable from the
    // request). A documented under-count, asserted so it stays known.
    expect(estimateRequestTokens(body)).toBeGreaterThan(100);
  });

  it('does not undercount CJK', () => {
    // 2000 CJK chars ≈ 2000 tokens, not 500. A chars/4 estimate would
    // under-reserve this 4x and let it overshoot by the same factor.
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: '字'.repeat(2000) }],
      max_tokens: 100,
    });
    expect(estimateRequestTokens(body)).toBeGreaterThanOrEqual(2000);
  });

  it('prefers max_completion_tokens over max_tokens', () => {
    const body = JSON.stringify({
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
      max_completion_tokens: 4000,
    });
    expect(estimateRequestTokens(body)).toBeGreaterThanOrEqual(4000);
  });

  it('honors a custom tokenizer', () => {
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], max_tokens: 10 });
    const got = estimateRequestTokens(body, { estimateTokens: () => 777 });
    expect(got).toBe(777 + 10);
  });

  // Reserve-all (0) is for bodies there is nothing to measure. Everything else
  // must produce a bounded number, because reserve-all serializes the budget
  // key and would turn one unrecognized shape into an app-wide throttle.
  it.each([
    ['empty', ''],
    ['undefined', undefined],
    ['oversized', `{"messages":[{"role":"user","content":"${'x'.repeat(MAX_ESTIMATE_BODY_BYTES + 1)}"}]}`],
  ])('reserves all only when unwalkable: %s', (_name, body) => {
    expect(estimateRequestTokens(body as string | undefined)).toBe(0);
  });

  it.each([
    ['not json', 'not json at all'],
    ['truncated json', '{"messages": [{"role":'],
    ['unknown schema', '{"some_other_api": {"field": "value"}}'],
    ['empty messages', '{"model": "gpt-4o", "messages": []}'],
    ['stream flag only', '{"model":"gpt-4o","stream":true}'],
  ])('bounds an unknown schema by its size: %s', (_name, body) => {
    const got = estimateRequestTokens(body);
    // Must not serialize the caller...
    expect(got).toBeGreaterThan(0);
    // ...and cannot exceed every byte counted as a token, plus the allowance.
    expect(got).toBeLessThanOrEqual(body.length + DEFAULT_OUTPUT_ALLOWANCE);
  });
});
