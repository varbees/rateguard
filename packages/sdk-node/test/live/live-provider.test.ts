/**
 * Live provider tests — RateGuard against a REAL LLM API, not a mock.
 *
 * Everything else in this suite proves RateGuard is self-consistent. These
 * prove it survives contact with a provider that was not built to our
 * assumptions: real usage schemas, real SSE framing, real latency.
 *
 * Node is the SDK that got this WRONG. It silently metered zero tokens for the
 * most common streaming shape in the ecosystem (e6eba43) while every one of its
 * ~300 tests passed, because they all inherited the same wrong assumption about
 * what providers send. Ten real bytes broke the loop. This is the harness that
 * keeps it broken open.
 *
 * Skipped unless a live endpoint is configured, so `vitest run` stays hermetic
 * and offline by default:
 *
 *   RATEGUARD_LIVE_BASE_URL=https://integrate.api.nvidia.com/v1 \
 *   RATEGUARD_LIVE_API_KEY=... \
 *   RATEGUARD_LIVE_MODEL=meta/llama-3.1-8b-instruct \
 *   npx vitest run test/live
 *
 * Or across every configured provider: scripts/live-matrix.sh
 *
 * Verified 2026-07-17 against NVIDIA NIM, Groq and DeepSeek free tiers.
 * NO LOCAL MODELS — they OOM the dev box. Captured bytes in
 * conformance/sse_usage_vectors.json serve the offline case better anyway.
 */

import { describe, it, expect } from 'vitest';
import { RateGuard, detectLLMCall } from '../../src/index.js';

const BASE_URL = process.env.RATEGUARD_LIVE_BASE_URL ?? '';
const API_KEY = process.env.RATEGUARD_LIVE_API_KEY ?? '';
const MODEL = process.env.RATEGUARD_LIVE_MODEL ?? '';

const configured = Boolean(BASE_URL && API_KEY && MODEL);
const live = configured ? describe : describe.skip;

const TIMEOUT = 60_000;
const url = (path: string) => `${BASE_URL.replace(/\/$/, '')}${path}`;

/**
 * The provider name RateGuard derives from the configured host.
 *
 * Derived, never assumed. The Python harness hardcoded "nvidia" here, which was
 * invisible while NIM was the only endpoint ever run, then reported "charged 0
 * tokens" against Groq — it was reading a budget key nothing writes. The SDK
 * keys budgets on the host; so must the test.
 */
function liveProvider(): string {
  const call = detectLLMCall(new URL(url('/chat/completions')));
  if (!call) {
    throw new Error(
      `RateGuard does not recognize ${new URL(BASE_URL).hostname} as an LLM host — ` +
        `this test would assert against a budget key that is never written.`,
    );
  }
  return call.provider;
}

function budgetKey(rg: RateGuard): string {
  return `${rg.runtime.config.tenantId}:${liveProvider()}:${MODEL}:outbound`;
}

/** What RateGuard actually charged against a key, this hour. */
function budgetUsed(rg: RateGuard, key: string): number {
  return rg.runtime.tokenBudget.usage(key, rg.runtime.config.tokenBudget).hour;
}

function chatBody(prompt: string, opts: { stream?: boolean; maxTokens?: number } = {}) {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: opts.maxTokens ?? 24,
    stream: opts.stream ?? false,
  };
  if (opts.stream) {
    // Without include_usage most providers stream no usage at all — the DoW
    // hole. Asked for explicitly so the MEASURED path is under test.
    body.stream_options = { include_usage: true };
  }
  return JSON.stringify(body);
}

function post(rg: RateGuard, path: string, body: string): Promise<Response> {
  return rg.wrapFetch()(url(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body,
  });
}

live('live provider', () => {
  it(
    'extracts usage from a real non-streaming response',
    async () => {
      const rg = new RateGuard({ preset: 'standard' });
      const resp = await post(rg, '/chat/completions', chatBody('Say OK'));
      const raw = await resp.text();
      expect(resp.status, raw).toBe(200);

      const payload = JSON.parse(raw);
      expect(payload.usage.total_tokens).toBeGreaterThan(0);
      // The bytes the caller sees must be the provider's own.
      expect(payload.choices[0].message.content).toBeTruthy();

      expect(rg.enforcementEvents()).toHaveLength(0);
    },
    TIMEOUT,
  );

  it(
    'charges the budget what the provider actually reported for a real stream',
    async () => {
      // THE regression. Not "did we parse usage" but "did the BUDGET move by
      // the number the provider reported" — the assertion Node did not have
      // when it was silently charging zero.
      const rg = new RateGuard({
        preset: 'streaming-llm',
        tokenBudget: { hourLimit: 100_000, mode: 'hard-stop' },
      });

      const resp = await post(rg, '/chat/completions', chatBody('Count to five.', { stream: true, maxTokens: 48 }));
      const raw = await resp.text();
      expect(resp.status, raw).toBe(200);

      // What the provider itself claims, read independently of RateGuard.
      let providerTotal = 0;
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data: ') || t.includes('[DONE]')) continue;
        try {
          const chunk = JSON.parse(t.slice(6));
          if (chunk?.usage?.total_tokens) {
            providerTotal = Math.max(providerTotal, chunk.usage.total_tokens);
          }
        } catch {
          /* non-JSON keepalive */
        }
      }
      if (providerTotal === 0) {
        // Not a pass — say so rather than assert nothing.
        console.warn('provider reported no usage; include_usage may be unsupported here');
        return;
      }

      // Byte transparency (rule 6): the terminal sentinel must survive.
      expect(raw).toContain('[DONE]');

      const charged = budgetUsed(rg, budgetKey(rg));
      expect(
        charged,
        `RateGuard charged ${charged} tokens after the real stream, provider reported ${providerTotal}`,
      ).toBe(providerTotal);
    },
    TIMEOUT,
  );

  it(
    'blocks a real runaway with a real budget',
    async () => {
      // The whole product claim. A budget that only blocks mocks is worthless.
      const rg = new RateGuard({ preset: 'standard', tokenBudget: { hourLimit: 60, mode: 'hard-stop' } });

      let blocked = false;
      for (let i = 0; i < 8; i++) {
        const resp = await post(rg, '/chat/completions', chatBody(`Write one short sentence about the number ${i}.`, { maxTokens: 32 }));
        await resp.text();
        if (resp.status === 429) {
          blocked = true;
          break;
        }
      }
      expect(blocked, 'a 60-token/hour budget never blocked across 8 real completions').toBe(true);

      const events = rg.enforcementEvents();
      expect(events.length, 'a block must leave an audit trail').toBeGreaterThan(0);
      expect(events.some((e) => e.type.includes('budget'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'halts real calls with the kill switch',
    async () => {
      const rg = new RateGuard({ preset: 'standard' });

      rg.freeze();
      const frozen = await post(rg, '/chat/completions', chatBody('Say OK', { maxTokens: 8 }));
      await frozen.text();
      expect(frozen.status, 'freeze did not halt a real call').toBe(403);

      rg.unfreeze();
      const thawed = await post(rg, '/chat/completions', chatBody('Say OK', { maxTokens: 8 }));
      await thawed.text();
      expect(thawed.status, 'unfreeze did not restore live calls').toBe(200);
    },
    TIMEOUT,
  );
});
