import { describe, expect, it } from 'vitest';
import { RateGuard } from '../src/index.js';
import {
  SemanticCache,
  cosineSimilarity,
  isStreamingRequestBody,
  promptTextFromRequestBody,
  type Embedder,
} from '../src/core/semantic-cache.js';

function fakeClock(startMs: number) {
  let now = startMs;
  return {
    clock: { now: () => now },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const openAIBody = (model: string, prompt: number, completion: number): string =>
  JSON.stringify({
    id: 'cmpl-1',
    model,
    choices: [{ message: { content: 'hi' } }],
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion },
  });

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors, 0 for orthogonal, and 0 for mismatched/empty/zero-norm inputs', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('isStreamingRequestBody', () => {
  it('detects stream:true and treats everything else (including malformed JSON) as non-streaming', () => {
    expect(isStreamingRequestBody('{"stream":true}')).toBe(true);
    expect(isStreamingRequestBody('{"stream":false}')).toBe(false);
    expect(isStreamingRequestBody('{}')).toBe(false);
    expect(isStreamingRequestBody('')).toBe(false);
    expect(isStreamingRequestBody('not json')).toBe(false);
  });
});

describe('promptTextFromRequestBody', () => {
  it('extracts system + message text and ignores non-text content parts', () => {
    const body = JSON.stringify({
      system: 'You are helpful.',
      messages: [
        { role: 'user', content: 'What is the capital of France?' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Paris.' },
            { type: 'image', url: 'https://example.com/x.png' },
          ],
        },
      ],
    });
    expect(promptTextFromRequestBody(body)).toBe(
      'system: You are helpful.\nuser: What is the capital of France?\nassistant: Paris.\n',
    );
  });

  it('returns empty string for non-JSON, empty, or content-less bodies', () => {
    expect(promptTextFromRequestBody('')).toBe('');
    expect(promptTextFromRequestBody('not json')).toBe('');
    expect(promptTextFromRequestBody('{}')).toBe('');
  });
});

describe('SemanticCache', () => {
  it('hits on a similar-enough embedding within threshold and misses below it', () => {
    const embedder: Embedder = { embed: async () => [] }; // unused: lookup/store take explicit vectors
    const cache = new SemanticCache({ embedder, similarityThreshold: 0.9 }, { now: () => 0 });

    cache.store('openai:gpt-4o', [1, 0, 0], { status: 200, headers: {}, body: 'cached-response' });

    // cosine([1,0,0], [0.99, 0.14, 0]) ~= 0.99 -> above threshold -> hit
    expect(cache.lookup('openai:gpt-4o', [0.99, 0.14, 0])?.body).toBe('cached-response');

    // orthogonal vector -> miss
    expect(cache.lookup('openai:gpt-4o', [0, 1, 0])).toBeUndefined();

    // different scope entirely -> miss regardless of similarity
    expect(cache.lookup('anthropic:claude-sonnet-4', [1, 0, 0])).toBeUndefined();
  });

  it('expires entries lazily and never serves an expired entry', () => {
    const { clock, advance } = fakeClock(0);
    const embedder: Embedder = { embed: async () => [] };
    const cache = new SemanticCache({ embedder, ttlMs: 1_000 }, clock);

    cache.store('scope', [1, 0], { status: 200, headers: {}, body: 'fresh' });
    expect(cache.lookup('scope', [1, 0])?.body).toBe('fresh');

    advance(1_001);
    expect(cache.lookup('scope', [1, 0])).toBeUndefined();
  });

  it('evicts oldest entries first once maxEntriesPerScope is exceeded', () => {
    const embedder: Embedder = { embed: async () => [] };
    const cache = new SemanticCache({ embedder, maxEntriesPerScope: 2, similarityThreshold: 0.99 }, { now: () => 0 });

    cache.store('scope', [1, 0, 0], { status: 200, headers: {}, body: 'first' });
    cache.store('scope', [0, 1, 0], { status: 200, headers: {}, body: 'second' });
    cache.store('scope', [0, 0, 1], { status: 200, headers: {}, body: 'third' }); // evicts "first"

    expect(cache.lookup('scope', [1, 0, 0])).toBeUndefined();
    expect(cache.lookup('scope', [0, 1, 0])?.body).toBe('second');
    expect(cache.lookup('scope', [0, 0, 1])?.body).toBe('third');
  });
});

/** Deterministic fake embedder: 26-dim letter-frequency vector (case-insensitive). */
class LetterFrequencyEmbedder implements Embedder {
  async embed(text: string): Promise<number[]> {
    const vec = new Array(26).fill(0);
    for (const ch of text.toLowerCase()) {
      const code = ch.charCodeAt(0) - 97;
      if (code >= 0 && code < 26) {
        vec[code] += 1;
      }
    }
    return vec;
  }
}

describe('wrapFetch semanticCache wiring', () => {
  it('serves a cache hit for a similar-enough prompt without calling the network again', async () => {
    let networkCalls = 0;
    const rg = new RateGuard({ preset: 'dev' });
    const wrapped = rg.wrapFetch({
      semanticCache: { embedder: new LetterFrequencyEmbedder(), similarityThreshold: 0.95 },
      fetch: (async () => {
        networkCalls++;
        return new Response(openAIBody('gpt-4o', 10, 5), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    });

    const first = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Tell me a fun fact about octopuses' }] }),
    });
    expect(first.status).toBe(200);
    expect(networkCalls).toBe(1);
    const firstText = await first.text();

    // Same letters (only case/punctuation differ, which the fake embedder
    // ignores/normalizes) -> identical embedding under this fixture -> hit.
    const second = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'tell me a fun fact about octopuses!' }] }),
    });
    expect(second.status).toBe(200);
    expect(networkCalls).toBe(1); // no additional network call
    expect(second.headers.get('x-rateguard-cache')).toBe('hit');
    expect(await second.text()).toBe(firstText);
  });

  it('misses the cache for a dissimilar prompt and stores it as a new entry', async () => {
    let networkCalls = 0;
    const rg = new RateGuard({ preset: 'dev' });
    const wrapped = rg.wrapFetch({
      semanticCache: { embedder: new LetterFrequencyEmbedder(), similarityThreshold: 0.95 },
      fetch: (async () => {
        networkCalls++;
        return new Response(openAIBody('gpt-4o', 10, 5), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    });

    await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Tell me a fun fact about octopuses' }] }),
    });
    expect(networkCalls).toBe(1);

    const unrelated = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Summarize quantum entanglement in Bell test experiments' }] }),
    });
    expect(unrelated.status).toBe(200);
    expect(networkCalls).toBe(2); // dissimilar prompt -> real call, not a cache hit
    expect(unrelated.headers.get('x-rateguard-cache')).toBeNull();
  });

  // Reproduces a real gap: the scope key was computed from the REQUESTED
  // provider/model before the call ran, but a fallback (retarget) never
  // mutates the caller's `call` object — it builds an entirely new one for
  // the recursive attempt. Caching a fallback answer under the pre-fallback
  // scope meant a later request that reached the ORIGINAL (now-recovered)
  // provider could get served the FALLBACK provider's stale, mislabeled
  // answer instead of a fresh real one.
  it('scopes a fallback response to the provider that actually served it, not the one requested', async () => {
    let primaryShouldFail = true;
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('deepseek-chat')) {
        fallbackCalls++;
        return new Response(openAIBody('deepseek-chat', 10, 5), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      primaryCalls++;
      if (primaryShouldFail) {
        return new Response('{"error":{"message":"rate limited"}}', { status: 429 });
      }
      return new Response(openAIBody('gpt-4o', 10, 5), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const rg = new RateGuard({ preset: 'dev' });
    const wrapped = rg.wrapFetch({
      fetch: mockFetch,
      chain: [{ name: 'deepseek', model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1', weight: 0 }],
      semanticCache: { embedder: new LetterFrequencyEmbedder(), similarityThreshold: 0.95 },
    });

    // Request 1: primary is down, falls back to deepseek. Gets cached —
    // the fix requires it be cached under deepseek's scope, not openai's.
    const prompt = 'what is the capital of france';
    const first = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] }),
    });
    expect(first.headers.get('x-rateguard-fallback')).toBe('true');
    expect(primaryCalls).toBe(1);
    expect(fallbackCalls).toBe(1);

    // Primary has recovered. Request 2 (IDENTICAL prompt -> identical
    // embedding, guaranteeing a cache match if scope agrees) must NOT be
    // served deepseek's cached answer as if it were openai's — it must
    // reach the network and get a fresh, real openai response. If the bug
    // were present (cached under "openai:gpt-4o"), this would be a
    // wrongful cache hit: primaryCalls would stay at 1 and the body would
    // still say "deepseek-chat".
    primaryShouldFail = false;
    const second = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] }),
    });

    expect(second.headers.get('x-rateguard-cache')).not.toBe('hit');
    expect(primaryCalls).toBe(2);
    const secondText = await second.text();
    expect(secondText).toContain('"model":"gpt-4o"');
  });

  it('never caches or serves streaming requests', async () => {
    let networkCalls = 0;
    // Generous token budget: the SSE usage scan that commits/releases the
    // outbound reservation runs asynchronously in the background (a
    // fire-and-forget tee), so two back-to-back streaming calls can have
    // overlapping in-flight reservations. A small budget would make the
    // second call's reservation legitimately contend with the first's —
    // a real budget-serialization behavior, but not what this test is
    // about (streaming bypasses the cache), so give it enough headroom.
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 1_000_000 } });
    const wrapped = rg.wrapFetch({
      semanticCache: { embedder: new LetterFrequencyEmbedder(), similarityThreshold: 0.95 },
      fetch: (async () => {
        networkCalls++;
        return new Response('data: [DONE]\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }) as typeof fetch,
    });

    const body = JSON.stringify({
      model: 'gpt-4o',
      stream: true,
      messages: [{ role: 'user', content: 'Tell me a fun fact about octopuses' }],
    });

    await wrapped('https://api.openai.com/v1/chat/completions', { method: 'POST', body });
    await wrapped('https://api.openai.com/v1/chat/completions', { method: 'POST', body });

    expect(networkCalls).toBe(2); // every streaming call hits the network — the cache is never consulted
  });

  it('does not embed or cache when no semanticCache option is configured', async () => {
    let networkCalls = 0;
    const rg = new RateGuard({ preset: 'dev' });
    const wrapped = rg.wrapFetch({
      fetch: (async () => {
        networkCalls++;
        return new Response(openAIBody('gpt-4o', 10, 5), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    });

    const body = JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'same prompt' }] });
    await wrapped('https://api.openai.com/v1/chat/completions', { method: 'POST', body });
    await wrapped('https://api.openai.com/v1/chat/completions', { method: 'POST', body });

    expect(networkCalls).toBe(2); // no cache configured -> always a real call
  });
});
