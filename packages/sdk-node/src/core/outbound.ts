/**
 * Outbound GenAI fetch wrapper — matching Go's outbound.go.
 *
 * Inbound middleware guards your API. Real LLM spend happens on OUTBOUND
 * calls to provider APIs. wrapFetch wraps the fetch every LLM SDK uses:
 *
 *   const rg = new RateGuard({ preset: 'llm-heavy' });
 *   const client = new OpenAI({ fetch: rg.wrapFetch() });
 *
 * Every LLM call is budgeted, breaker-protected, and metered with REAL
 * token usage — with optional fallback across OpenAI-compatible providers.
 * No proxy hop; runs in-process.
 *
 * Honest scope: automatic fallback only applies to OpenAI-compatible
 * endpoints (same request schema). Cross-schema fallback (OpenAI →
 * Anthropic native) is impossible at the transport layer and is NOT claimed.
 */

import { CircuitBreaker } from './circuit-breaker.js';
import { extractTokenUsageFromText } from './utils.js';
import { SemanticCache, isStreamingRequestBody, promptTextFromRequestBody, type SemanticCacheOptions } from './semantic-cache.js';
import type { ProviderEntry } from './provider-chain.js';
import type { RateGuardRuntime } from '../runtime.js';
import type { TokenUsage } from '../types.js';

export type OutboundMode = 'enforce' | 'observe';

export interface OutboundCall {
  provider: string;
  model: string;
  operation: 'chat' | 'text_completion' | 'embedding';
  compatible: boolean;
  pathSuffix: string;
}

export interface WrapFetchOptions {
  /** enforce (default): synthesize 429/503 when limits say no. observe: never block. */
  mode?: OutboundMode;
  /** Fallback providers, tried in order on 429/5xx/breaker-open. OpenAI-compatible only. */
  chain?: ProviderEntry[];
  /**
   * Bounds the per-call hard-stop budget reservation. Defaults to 4096 —
   * reserving the whole remaining budget per call would serialize
   * concurrent agents. Negative = strict reserve-all semantics.
   */
  estimatedTokens?: number;
  /** Skip the outbound per-provider request limiter. */
  disableRateLimit?: boolean;
  /** Base fetch to wrap. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * Enables semantic response caching for this transport. Undefined
   * (default) disables it entirely — no embedding calls, no memory
   * overhead. A hit skips the network call, the rate limiter, the circuit
   * breaker, and the token budget entirely: it is a real dollar saved, not
   * just a faster response. Streaming requests always bypass the cache.
   */
  semanticCache?: SemanticCacheOptions;
}

const MAX_EXTRACT_BYTES = 1 << 20; // 1 MiB cap on JSON usage extraction
const MAX_SSE_LINE_BYTES = 256 << 10;
const MAX_SSE_CANDIDATES = 8;
const DEFAULT_OUTBOUND_ESTIMATED_TOKENS = 4096; // typical chat-call upper bound

// OpenAI-schema hosts (suffix matching on the path covers Groq's /openai/v1/,
// Cohere's /compatibility/v1/, DashScope's /compatible-mode/v1/, DeepInfra's
// /v1/openai/, Z.AI's /api/paas/v4/, ...).
//
// Every host here was checked against that provider's own current API docs,
// not carried over from a list someone else compiled — two are deliberately
// NOT here despite both offering "OpenAI-compatible" access. See Go's
// outbound.go (the reference implementation) for why: Cloudflare AI Gateway's
// current recommended endpoint lives under Cloudflare's single shared
// general-purpose API host (used for DNS, Workers, R2, ...), not a dedicated
// LLM host, and its other endpoint shape embeds a per-customer account+
// gateway ID in the path itself — no fixed hostname to key off. IBM
// watsonx.ai's OpenAI-compatible "Model Gateway" is explicitly preview-status
// in IBM's own docs and split across region-specific hosts rather than one
// fixed host, the same shape as AWS Bedrock (a native, non-map-based
// adapter) — revisit once it reaches GA with a confirmed stable endpoint.
const OPENAI_COMPATIBLE_HOSTS: Record<string, string> = {
  'api.openai.com': 'openai',
  'api.deepseek.com': 'deepseek',
  'api.groq.com': 'groq',
  'api.mistral.ai': 'mistral',
  'api.together.xyz': 'together',
  'openrouter.ai': 'openrouter',
  'api.x.ai': 'xai',
  'api.perplexity.ai': 'perplexity',
  'api.moonshot.ai': 'moonshot',
  'api.fireworks.ai': 'fireworks',
  'api.cerebras.ai': 'cerebras',
  'api.cohere.ai': 'cohere',
  'api.cohere.com': 'cohere',
  'dashscope.aliyuncs.com': 'dashscope',
  'api.sambanova.ai': 'sambanova',
  'integrate.api.nvidia.com': 'nvidia',
  'api.deepinfra.com': 'deepinfra',
  'router.huggingface.co': 'huggingface',
  'inference.baseten.co': 'baseten',
  'api.tokenfactory.nebius.com': 'nebius',
  'api.z.ai': 'zai',
  'open.bigmodel.cn': 'zai',
  'api.siliconflow.com': 'siliconflow',
  'api.siliconflow.cn': 'siliconflow',
  'router.requesty.ai': 'requesty',
  'models.github.ai': 'github',
};

/** Classifies an outbound URL. Returns undefined for non-LLM traffic. */
export function detectLLMCall(url: URL): OutboundCall | undefined {
  const host = url.hostname;
  const path = url.pathname;

  const compatibleProvider = OPENAI_COMPATIBLE_HOSTS[host];
  if (compatibleProvider) {
    if (path.endsWith('/chat/completions')) {
      return { provider: compatibleProvider, model: '', operation: 'chat', compatible: true, pathSuffix: path };
    }
    if (path.endsWith('/responses')) {
      return { provider: compatibleProvider, model: '', operation: 'chat', compatible: false, pathSuffix: path };
    }
    if (path.endsWith('/embeddings')) {
      return { provider: compatibleProvider, model: '', operation: 'embedding', compatible: false, pathSuffix: path };
    }
    if (path.endsWith('/completions')) {
      return { provider: compatibleProvider, model: '', operation: 'text_completion', compatible: true, pathSuffix: path };
    }
    return undefined;
  }

  if (host === 'api.anthropic.com' && path.endsWith('/messages')) {
    return { provider: 'anthropic', model: '', operation: 'chat', compatible: false, pathSuffix: path };
  }

  if (host === 'generativelanguage.googleapis.com') {
    if (path.endsWith('/chat/completions')) {
      return { provider: 'google', model: '', operation: 'chat', compatible: true, pathSuffix: path };
    }
    if (path.includes(':generateContent') || path.includes(':streamGenerateContent')) {
      return { provider: 'google', model: googleModelFromPath(path), operation: 'chat', compatible: false, pathSuffix: path };
    }
    return undefined;
  }

  if (host.endsWith('aiplatform.googleapis.com')) {
    if (path.includes(':generateContent') || path.includes(':streamGenerateContent')) {
      return { provider: 'google_vertex', model: googleModelFromPath(path), operation: 'chat', compatible: false, pathSuffix: path };
    }
    return undefined;
  }

  if (host.endsWith('.openai.azure.com') || host.endsWith('.cognitiveservices.azure.com')) {
    if (path.endsWith('/chat/completions')) {
      return { provider: 'azure_openai', model: '', operation: 'chat', compatible: true, pathSuffix: path };
    }
    if (path.endsWith('/embeddings')) {
      return { provider: 'azure_openai', model: '', operation: 'embedding', compatible: false, pathSuffix: path };
    }
    return undefined;
  }

  if (host.startsWith('bedrock-runtime.') && host.endsWith('.amazonaws.com')) {
    const match = path.match(/\/model\/([^/]+)\/(converse|invoke|converse-stream|invoke-with-response-stream)$/);
    if (match && match[1]) {
      return { provider: 'aws_bedrock', model: decodeURIComponent(match[1]), operation: 'chat', compatible: false, pathSuffix: path };
    }
    return undefined;
  }

  // Self-hosted OpenAI-compatible servers (vLLM, llama.cpp, LocalAI, ...).
  if (path.endsWith('/chat/completions')) {
    return { provider: host, model: '', operation: 'chat', compatible: true, pathSuffix: path };
  }

  return undefined;
}

function googleModelFromPath(path: string): string {
  const marker = '/models/';
  const idx = path.indexOf(marker);
  if (idx === -1) return '';
  const rest = path.slice(idx + marker.length);
  const colon = rest.indexOf(':');
  return colon === -1 ? rest : rest.slice(0, colon);
}

function modelFromBody(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'model' in parsed && typeof (parsed as { model: unknown }).model === 'string') {
      return ((parsed as { model: string }).model).trim();
    }
  } catch {
    // non-JSON body — no model
  }
  return '';
}

function synthesizedResponse(status: number, code: string, message: string, retryAfterMs: number): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-rateguard-synthesized': 'true',
  };
  if (retryAfterMs > 0) {
    headers['retry-after'] = String(Math.ceil(retryAfterMs / 1000));
  }
  return new Response(JSON.stringify({ error: { type: code, message, source: 'rateguard' } }), { status, headers });
}

function isProviderFailure(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Wraps fetch with outbound GenAI tracking bound to a runtime.
 */
export function wrapFetch(runtime: RateGuardRuntime, options: WrapFetchOptions = {}): typeof fetch {
  const baseFetch = options.fetch ?? globalThis.fetch;
  const mode = options.mode ?? 'enforce';
  const rawEstimate = options.estimatedTokens ?? DEFAULT_OUTBOUND_ESTIMATED_TOKENS;
  const estimatedTokens = rawEstimate < 0 ? 0 : rawEstimate; // negative = strict reserve-all
  const breakers = new Map<string, CircuitBreaker>();
  const cache = options.semanticCache ? new SemanticCache(options.semanticCache, runtime.config.clock) : undefined;

  const breakerFor = (provider: string): CircuitBreaker => {
    let breaker = breakers.get(provider);
    if (!breaker) {
      breaker = new CircuitBreaker(runtime.config.clock, runtime.config.circuitBreaker);
      breakers.set(provider, breaker);
    }
    return breaker;
  };

  const finish = (budgetKey: string, reservationId: string | undefined, usage: TokenUsage | undefined): void => {
    if (usage && usage.totalTokens > 0) {
      runtime.tokenBudget.commitReservation(budgetKey, reservationId, usage.totalTokens);
    } else {
      runtime.tokenBudget.releaseReservation(budgetKey, reservationId);
    }
  };

  const attempt = async (
    url: URL,
    init: RequestInit,
    body: string | undefined,
    call: OutboundCall,
    depth: number,
  ): Promise<Response> => {
    const enforce = mode !== 'observe';
    const breaker = breakerFor(call.provider);
    const breakerDecision = breaker.allow();

    const fallbackTarget = (): ProviderEntry | undefined => {
      if (!options.chain || !call.compatible || body === undefined) return undefined;
      return options.chain[depth];
    };

    const retarget = async (target: ProviderEntry): Promise<Response> => {
      let nextBody = body ?? '';
      if (target.model) {
        try {
          const parsed = JSON.parse(nextBody) as Record<string, unknown>;
          parsed.model = target.model;
          nextBody = JSON.stringify(parsed);
        } catch {
          // keep original body
        }
      }
      // OpenAI-SDK convention: baseURL owns the version prefix; append only
      // the canonical operation suffix, not the original full path.
      const suffix =
        call.pathSuffix.endsWith('/completions') && !call.pathSuffix.endsWith('/chat/completions')
          ? '/completions'
          : '/chat/completions';
      const nextURL = new URL(target.baseURL.replace(/\/$/, '') + suffix);
      const headers = new Headers(init.headers);
      // Provider credentials never transfer across providers. Strip every
      // known provider auth header convention, not just Authorization —
      // Azure OpenAI authenticates via a bare "api-key" header (not
      // "x-api-key"), which this list previously missed entirely, leaking
      // the Azure key to whichever provider was failed over to.
      headers.delete('authorization');
      headers.delete('x-api-key');
      headers.delete('api-key');
      headers.delete('x-goog-api-key');
      for (const [key, value] of Object.entries(target.headers ?? {})) {
        headers.set(key, value);
      }
      headers.set('x-rateguard-fallback-from', call.provider);

      const nextCall: OutboundCall = {
        provider: target.name,
        model: target.model || call.model,
        operation: call.operation,
        compatible: true,
        pathSuffix: call.pathSuffix,
      };
      const response = await attempt(nextURL, { ...init, headers, body: nextBody }, nextBody, nextCall, depth + 1);
      const wrapped = new Response(response.body, response);
      wrapped.headers.set('x-rateguard-fallback', 'true');
      wrapped.headers.set('x-rateguard-provider', target.name);
      return wrapped;
    };

    if (!breakerDecision.allowed) {
      const target = fallbackTarget();
      if (target) return retarget(target);
      if (enforce) {
        return synthesizedResponse(503, 'circuit_open', `rateguard: circuit open for provider ${call.provider}`, breakerDecision.retryAfterMs);
      }
    }

    if (!options.disableRateLimit) {
      const decision = await runtime.rateLimiter.allow(`outbound:${call.provider}`, {
        requestsPerSecond: runtime.config.rateLimit.requestsPerSecond,
        burst: runtime.config.rateLimit.burst,
        windowMs: runtime.config.rateLimit.windowMs,
        remoteRateLimitEndpoint: runtime.config.rateLimit.remoteRateLimitEndpoint,
        apiKey: runtime.config.apiKey,
      });
      if (decision.applied && !decision.allowed && enforce) {
        return synthesizedResponse(429, 'rate_limit_exceeded', `rateguard: outbound rate limit for provider ${call.provider}`, decision.retryAfterMs);
      }
    }

    const budgetKey = `${runtime.config.tenantId}:${call.provider}:${call.model || 'default'}:outbound`;
    const reservation = runtime.tokenBudget.reserve(budgetKey, runtime.config.tokenBudget, estimatedTokens);
    if (reservation.decision.applied && !reservation.decision.allowed && enforce) {
      return synthesizedResponse(429, 'token_budget_exceeded', `rateguard: outbound token budget exhausted for ${call.provider}`, reservation.decision.retryAfterMs);
    }

    let response: Response;
    try {
      response = await baseFetch(url, init);
    } catch (error) {
      breaker.recordOutcome(false);
      runtime.tokenBudget.releaseReservation(budgetKey, reservation.reservationId);
      const target = fallbackTarget();
      if (target) return retarget(target);
      throw error;
    }

    if (isProviderFailure(response.status)) {
      breaker.recordOutcome(false);
      runtime.tokenBudget.releaseReservation(budgetKey, reservation.reservationId);
      const target = fallbackTarget();
      if (target) return retarget(target);
      return response;
    }

    breaker.recordOutcome(true);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.startsWith('text/event-stream') && response.body) {
      const [forCaller, forScan] = response.body.tee();
      void scanSSEStream(forScan)
        .then((usage) => finish(budgetKey, reservation.reservationId, usage))
        .catch(() => finish(budgetKey, reservation.reservationId, undefined));
      return new Response(forCaller, response);
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_EXTRACT_BYTES) {
      finish(budgetKey, reservation.reservationId, undefined);
      return response;
    }

    try {
      const text = await response.clone().text();
      const usage = text.length <= MAX_EXTRACT_BYTES ? extractTokenUsageFromText(text) : undefined;
      finish(budgetKey, reservation.reservationId, usage);
    } catch {
      finish(budgetKey, reservation.reservationId, undefined);
    }
    return response;
  };

  /**
   * Checks the semantic cache before making the real call and stores a
   * fresh, cacheable response afterward. A hit bypasses `attempt` entirely —
   * no breaker check, no rate limit, no token budget, no network call,
   * because the whole point is that nothing was actually spent.
   */
  const attemptWithCache = async (url: URL, init: RequestInit, bodyText: string, call: OutboundCall): Promise<Response> => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const semanticCache = cache!;
    let scope = `${call.provider}:${call.model || 'default'}`;
    const prompt = promptTextFromRequestBody(bodyText);
    if (!prompt) {
      return attempt(url, init, bodyText || undefined, call, 0);
    }

    let embedding: number[];
    try {
      embedding = await semanticCache.embed(prompt);
    } catch {
      // Embedding failure degrades to a real call — caching is a cost
      // optimization, never a reason to fail the request.
      return attempt(url, init, bodyText || undefined, call, 0);
    }
    if (!embedding || embedding.length === 0) {
      return attempt(url, init, bodyText || undefined, call, 0);
    }

    const cached = semanticCache.lookup(scope, embedding);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-rateguard-cache', 'hit');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const response = await attempt(url, init, bodyText || undefined, call, 0);

    // Never cache a rejection we synthesized ourselves, a non-200, or a
    // streaming response — a cached response is a full body, and replaying
    // it as a fabricated SSE stream would misrepresent timing to the caller.
    if (response.status !== 200 || response.headers.get('x-rateguard-synthesized') === 'true') {
      return response;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.startsWith('text/event-stream')) {
      return response;
    }

    try {
      // Reuse the same clone()+text() pattern the token-usage extraction
      // path uses below — never double-buffer the body the caller reads.
      const text = await response.clone().text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      // `scope` was computed from the REQUESTED provider/model before
      // attempt() ran — but attempt() may have internally fallen over to a
      // different provider (retarget), which never mutates the caller's
      // `call` object (it builds an entirely new one for the recursive
      // call). Caching under the pre-fallback scope means a later request
      // that still reaches the ORIGINAL (now-recovered) provider could
      // replay the FALLBACK provider's answer. Recompute the scope from
      // what actually served this response.
      if (response.headers.get('x-rateguard-fallback') === 'true') {
        const servedProvider = response.headers.get('x-rateguard-provider') || call.provider;
        const servedModel = modelFromBody(text) || call.model || 'default';
        scope = `${servedProvider}:${servedModel}`;
      }
      semanticCache.store(scope, embedding, { status: response.status, headers, body: text });
    } catch {
      // Storing is best-effort; never fail the real response over it.
    }
    return response;
  };

  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      if (typeof input === 'string') url = new URL(input);
      else if (input instanceof URL) url = input;
      else url = new URL(input.url);
    } catch {
      return baseFetch(input as RequestInfo, init);
    }

    const call = detectLLMCall(url);
    if (!call) {
      return baseFetch(input as RequestInfo, init);
    }

    const requestInit: RequestInit = { ...(init ?? {}) };
    if (typeof input !== 'string' && !(input instanceof URL)) {
      // Merge Request fields we need; body streams on Request objects are
      // not sniffable without consuming them — tracking still works.
      requestInit.method = requestInit.method ?? input.method;
      requestInit.headers = requestInit.headers ?? input.headers;
    }

    const body = typeof requestInit.body === 'string' ? requestInit.body : undefined;
    if (!call.model && body) {
      call.model = modelFromBody(body);
    }

    if (cache && !isStreamingRequestBody(body ?? '')) {
      return attemptWithCache(url, requestInit, body ?? '', call);
    }

    return attempt(url, requestInit, body, call, 0);
  };

  return guarded as typeof fetch;
}

/** Incrementally scans an SSE stream copy and merges usage events. */
async function scanSSEStream(stream: ReadableStream<Uint8Array>): Promise<TokenUsage | undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let lineBuf = '';
  let overlong = false;
  const candidates: string[] = [];

  const pushCandidate = (payload: string): void => {
    if (payload.length === 0 || payload === '[DONE]') return;
    if (!payload.includes('usage') && !payload.includes('total_tokens') &&
        !payload.includes('input_tokens') && !payload.includes('output_tokens')) {
      return;
    }
    if (candidates.length >= MAX_SSE_CANDIDATES) {
      // Keep first half (Anthropic message_start) + most recent half.
      candidates.splice(MAX_SSE_CANDIDATES / 2, 1);
    }
    candidates.push(payload);
  };

  const processLine = (line: string): void => {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!trimmed.startsWith('data:')) return;
    pushCandidate(trimmed.slice(5).trim());
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let text = decoder.decode(value, { stream: true });
    for (;;) {
      const idx = text.indexOf('\n');
      if (idx === -1) {
        if (!overlong) {
          lineBuf += text;
          if (lineBuf.length > MAX_SSE_LINE_BYTES) {
            overlong = true;
            lineBuf = '';
          }
        }
        break;
      }
      const line = lineBuf + text.slice(0, idx);
      text = text.slice(idx + 1);
      if (!overlong) processLine(line);
      lineBuf = '';
      overlong = false;
    }
  }
  if (lineBuf && !overlong) processLine(lineBuf);

  if (candidates.length === 0) return undefined;
  return extractTokenUsageFromText(candidates.map((c) => `data: ${c}`).join('\n'));
}
