import { describe, it, expect } from 'vitest';
import { RateGuard } from '../src/index.js';

// AGENTS.md rule 11: the outbound wrapper delivers the EXACT bytes the provider
// sent — never rewrite framing, never buffer a stream whole. Go fuzzes this and
// Python asserts it inline; Node asserted byte-passthrough only for a small
// single-shot SSE body. This names the rule and covers the part that assertion
// did not: a LARGE, genuinely CHUNKED stream, which is where "never buffer
// whole" actually bites. It is also the exact property the SSE-usage bug lived
// next to, in the exact SDK where that bug lived.

function chunkedSSE(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('byte transparency (rule 11)', () => {
  it('delivers a large multi-chunk stream byte-for-byte', async () => {
    // ~500 KB across 5,000 real chunks. If the transport buffered the whole
    // stream to scan it, or altered framing, this diverges.
    const chunks: string[] = [];
    for (let i = 0; i < 5000; i++) {
      chunks.push(`data: {"id":"c${i}","choices":[{"delta":{"content":"tok${i} "}}]}\n\n`);
    }
    chunks.push('data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":25,"total_tokens":35}}\n\n');
    chunks.push('data: [DONE]\n\n');
    const expected = chunks.join('');

    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 1_000_000 } });
    const wrapped = rg.wrapFetch({ fetch: (async () => chunkedSSE(chunks)) as typeof fetch });

    const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', stream: true }),
    });
    const received = await resp.text();

    expect(received.length).toBe(expected.length);
    expect(received).toBe(expected);

    // And usage was still extracted from the final chunk — passthrough does not
    // mean blindness. The side-scan settles async.
    await new Promise((r) => setTimeout(r, 20));
    const key = `${rg.runtime.config.tenantId}:openai:gpt-4o:outbound`;
    expect(rg.runtime.tokenBudget.usage(key, rg.runtime.config.tokenBudget).hour).toBe(35);
  });

  it('preserves exotic framing untouched (CRLF, comments, no trailing newline)', async () => {
    // Real providers send heartbeat comments and mixed line endings. None of it
    // may be normalized on the way to the caller.
    const raw =
      ': keepalive\r\n' +
      'data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\n' +
      ': ping\n' +
      'data: {"choices":[],"usage":{"total_tokens":7}}\n\n' +
      'data: [DONE]'; // deliberately no trailing newline

    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 10_000 } });
    const wrapped = rg.wrapFetch({
      fetch: (async () => new Response(raw, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch,
    });

    const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', stream: true }),
    });
    expect(await resp.text()).toBe(raw);
  });
});
