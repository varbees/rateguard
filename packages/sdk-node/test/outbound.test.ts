import { describe, it, expect } from 'vitest';

import { RateGuard } from '../src/index.js';
import { detectLLMCall } from '../src/core/outbound.js';

// Mirrors Go's outbound_test.go: the wrapper must track real usage, block on
// exhausted budgets, fall back across OpenAI-compatible providers, and leave
// non-LLM traffic and streamed bytes untouched.

const openAIBody = (model: string, prompt: number, completion: number): string =>
  JSON.stringify({
    id: 'cmpl-1',
    model,
    choices: [{ message: { content: 'hi' } }],
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion },
  });

const jsonResponse = (body: string): Response =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

describe('detectLLMCall', () => {
  it('classifies the provider matrix like the Go SDK', () => {
    const cases: Array<[string, string, boolean]> = [
      ['https://api.openai.com/v1/chat/completions', 'openai', true],
      ['https://api.anthropic.com/v1/messages', 'anthropic', false],
      ['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'google', true],
      ['https://myres.openai.azure.com/openai/deployments/gpt4o/chat/completions', 'azure_openai', true],
      ['https://bedrock-runtime.us-east-1.amazonaws.com/model/meta.llama3-70b/invoke', 'aws_bedrock', false],
      ['https://api.groq.com/openai/v1/chat/completions', 'groq', true],
      ['https://my-vllm.internal:8000/v1/chat/completions', 'my-vllm.internal', true],
      // New providers this round — every path below is the real path shape
      // from that provider's own current API docs, not a guess.
      ['https://api.deepinfra.com/v1/openai/chat/completions', 'deepinfra', true],
      ['https://router.huggingface.co/v1/chat/completions', 'huggingface', true],
      ['https://inference.baseten.co/v1/chat/completions', 'baseten', true],
      ['https://api.tokenfactory.nebius.com/v1/chat/completions', 'nebius', true],
      ['https://api.z.ai/api/paas/v4/chat/completions', 'zai', true],
      ['https://open.bigmodel.cn/api/paas/v4/chat/completions', 'zai', true],
      ['https://api.siliconflow.com/v1/chat/completions', 'siliconflow', true],
      ['https://api.siliconflow.cn/v1/chat/completions', 'siliconflow', true],
      ['https://router.requesty.ai/v1/chat/completions', 'requesty', true],
      ['https://models.github.ai/inference/chat/completions', 'github', true],
    ];
    for (const [url, provider, compatible] of cases) {
      const call = detectLLMCall(new URL(url));
      expect(call, url).toBeDefined();
      expect(call!.provider, url).toBe(provider);
      expect(call!.compatible, url).toBe(compatible);
    }
    expect(detectLLMCall(new URL('https://api.stripe.com/v1/charges'))).toBeUndefined();
  });
});

describe('wrapFetch', () => {
  it('tracks real JSON usage into the token budget', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 10_000 } });
    const wrapped = rg.wrapFetch({
      fetch: (async () => jsonResponse(openAIBody('gpt-4o', 100, 50))) as typeof fetch,
    });

    const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [] }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.text();
    expect(body).toContain('"total_tokens":150');

    const budgetKey = `${rg.runtime.config.tenantId}:openai:gpt-4o:outbound`;
    const usage = rg.runtime.tokenBudget.usage(budgetKey, rg.runtime.config.tokenBudget);
    expect(usage.hour).toBe(150);
  });

  it('extracts usage from OpenAI-style SSE with usage:null intermediates', async () => {
    const sse = [
      'data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"He"}}],"usage":null}',
      '',
      'data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"llo"}}],"usage":null}',
      '',
      'data: {"id":"c1","model":"gpt-4o","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":25,"total_tokens":35}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 10_000 } });
    const wrapped = rg.wrapFetch({
      fetch: (async () =>
        new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch,
    });

    const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', stream: true }),
    });

    // Caller receives the exact SSE payload.
    const received = await resp.text();
    expect(received).toBe(sse);

    // Scan side settles asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const budgetKey = `${rg.runtime.config.tenantId}:openai:gpt-4o:outbound`;
    const usage = rg.runtime.tokenBudget.usage(budgetKey, rg.runtime.config.tokenBudget);
    expect(usage.hour).toBe(35);
  });

  it('charges the reserved estimate when a stream carries no usage', async () => {
    // OpenAI-compatible streaming WITHOUT stream_options.include_usage: content
    // deltas and [DONE], no usage anywhere. Recording zero would let a runaway
    // agent stream forever without touching its budget — the reserved estimate
    // must be committed instead (conservative enforcement, not blindness).
    const sse = [
      'data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"He"}}]}',
      '',
      'data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"llo"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 10_000, mode: 'hard-stop' } });
    const wrapped = rg.wrapFetch({
      estimatedTokens: 500,
      fetch: (async () =>
        new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch,
    });

    const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', stream: true }),
    });
    expect(await resp.text()).toBe(sse);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const budgetKey = `${rg.runtime.config.tenantId}:openai:gpt-4o:outbound`;
    const usage = rg.runtime.tokenBudget.usage(budgetKey, rg.runtime.config.tokenBudget);
    expect(usage.hour).toBe(500);
  });

  it('merges Anthropic split usage with max semantics', async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"m1","model":"claude-sonnet-4","usage":{"input_tokens":42,"output_tokens":1}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":88}}',
      '',
    ].join('\n');

    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 10_000 } });
    const wrapped = rg.wrapFetch({
      fetch: (async () =>
        new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch,
    });

    const resp = await wrapped('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-sonnet-4', stream: true }),
    });
    await resp.text();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const budgetKey = `${rg.runtime.config.tenantId}:anthropic:claude-sonnet-4:outbound`;
    const usage = rg.runtime.tokenBudget.usage(budgetKey, rg.runtime.config.tokenBudget);
    // 42 input + max(1, 88) output = 130 — summing would give 131.
    expect(usage.hour).toBe(130);
  });

  it('blocks with a synthesized 429 when the budget is exhausted', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 600 } });
    const wrapped = rg.wrapFetch({
      fetch: (async () => jsonResponse(openAIBody('gpt-4o', 400, 100))) as typeof fetch,
    });

    const send = () =>
      wrapped('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-4o' }),
      });

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200); // 100 of 600 remains
    const blocked = await send(); // used 1000 of 600 — exhausted
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('x-rateguard-synthesized')).toBe('true');
  });

  it('observe mode never blocks but still meters', async () => {
    const rg = new RateGuard({ preset: 'dev', tokenBudget: { hourLimit: 100 } });
    const wrapped = rg.wrapFetch({
      mode: 'observe',
      fetch: (async () => jsonResponse(openAIBody('gpt-4o', 400, 100))) as typeof fetch,
    });

    for (let i = 0; i < 3; i++) {
      const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-4o' }),
      });
      expect(resp.status).toBe(200);
    }
    const budgetKey = `${rg.runtime.config.tenantId}:openai:gpt-4o:outbound`;
    expect(rg.runtime.tokenBudget.usage(budgetKey, rg.runtime.config.tokenBudget).hour).toBe(1500);
  });

  it('falls back to the next OpenAI-compatible provider on 429', async () => {
    const seen: Array<{ url: string; auth: string | null; model: string }> = [];
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      const headers = new Headers(init?.headers);
      seen.push({ url, auth: headers.get('authorization'), model: JSON.parse(body || '{}').model ?? '' });
      if (body.includes('deepseek-chat')) {
        return jsonResponse(openAIBody('deepseek-chat', 10, 5));
      }
      return new Response('{"error":{"message":"rate limited"}}', { status: 429 });
    }) as typeof fetch;

    const rg = new RateGuard({ preset: 'dev' });
    const wrapped = rg.wrapFetch({
      fetch: mockFetch,
      chain: [
        { name: 'deepseek', model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1', headers: { Authorization: 'Bearer fallback-key' }, weight: 0 },
      ],
    });

    const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer primary-key' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [] }),
    });

    expect(resp.status).toBe(200);
    expect(resp.headers.get('x-rateguard-fallback')).toBe('true');
    expect(seen).toHaveLength(2);
    expect(seen[1]!.url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(seen[1]!.auth).toBe('Bearer fallback-key');
    expect(seen[1]!.model).toBe('deepseek-chat');
  });

  // Reproduces a real credential-leak bug: Azure OpenAI authenticates via
  // a bare "api-key" header (not "authorization" or "x-api-key"), which
  // retarget's credential-stripping list previously missed entirely.
  // Failing over from Azure to another provider that doesn't set its own
  // api-key header used to forward the Azure key verbatim.
  it('strips the Azure api-key header on fallback instead of leaking it', async () => {
    const seen: Array<{ url: string; apiKey: string | null; model: string }> = [];
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      const headers = new Headers(init?.headers);
      seen.push({ url, apiKey: headers.get('api-key'), model: JSON.parse(body || '{}').model ?? '' });
      if (body.includes('deepseek-chat')) {
        return jsonResponse(openAIBody('deepseek-chat', 10, 5));
      }
      return new Response('{"error":{"message":"rate limited"}}', { status: 429 });
    }) as typeof fetch;

    const rg = new RateGuard({ preset: 'dev' });
    // Deliberately no `headers` on the fallback target — the only way
    // this test can fail is if the primary's Azure key leaks through.
    const wrapped = rg.wrapFetch({
      fetch: mockFetch,
      chain: [{ name: 'deepseek', model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1', weight: 0 }],
    });

    const resp = await wrapped('https://my-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions', {
      method: 'POST',
      headers: { 'api-key': 'azure-secret-key' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [] }),
    });

    expect(resp.status).toBe(200);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.apiKey).toBeNull();
  });

  // Reproduces a real bug: defaultProviderChain/budgetProviderChain/
  // qualityProviderChain used to return a ProviderChain instance, but the
  // real wrapFetch chain option is typed ProviderEntry[] and indexes it as
  // a plain array (see outbound.ts: `options.chain[depth]`). Passing the
  // ProviderChain instance through failed to even typecheck — confirmed by
  // actually trying to compile `wrapFetch({ chain: defaultProviderChain() })`,
  // not by inspection. Separately, an earlier version of all three chains
  // included a raw 'anthropic' entry pointed at Anthropic's native base
  // URL — but the fallback appends '/chat/completions' and resends the
  // same OpenAI-shaped body, which Anthropic's real Messages API
  // (/v1/messages, a different schema) would reject. Both bugs fixed
  // together: every chain now returns a plain ProviderEntry[], all
  // genuinely OpenAI-compatible.
  it('preset provider chains are usable and openai-compatible', async () => {
    const { defaultProviderChain, budgetProviderChain, qualityProviderChain } = await import('../src/core/provider-chain.js');

    for (const factory of [defaultProviderChain, budgetProviderChain, qualityProviderChain]) {
      const chain = factory();
      expect(Array.isArray(chain)).toBe(true);
      for (const entry of chain) {
        expect(entry.name, `${factory.name} includes a raw anthropic entry`).not.toBe('anthropic');
      }
    }

    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('openai.com')) {
        return new Response('{"error":{"message":"rate limited"}}', { status: 429 });
      }
      return jsonResponse(openAIBody('gemini-2.5-flash', 5, 3));
    }) as typeof fetch;

    const rg = new RateGuard({ preset: 'dev' });
    const wrapped = rg.wrapFetch({ fetch: mockFetch, chain: defaultProviderChain() });

    const resp = await wrapped('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('x-rateguard-fallback')).toBe('true');
  });

  it('passes non-LLM traffic through untouched', async () => {
    let baseCalls = 0;
    const rg = new RateGuard({ preset: 'dev' });
    const wrapped = rg.wrapFetch({
      fetch: (async () => {
        baseCalls++;
        return new Response('plain');
      }) as typeof fetch,
    });

    const resp = await wrapped('https://example.com/healthz');
    expect(await resp.text()).toBe('plain');
    expect(baseCalls).toBe(1);
  });
});
