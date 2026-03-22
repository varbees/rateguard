import { RateGuardRuntime } from '../runtime.js';
import { formatRetryAfterMs, readFirstHeader } from '../core/utils.js';
import type { RateGuardOptions, RequestContext, ResponseSnapshot } from '../types.js';

export interface FastifyLikeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface FastifyLikeReply {
  code(statusCode: number): FastifyLikeReply;
  header(name: string, value: string): FastifyLikeReply;
  send(payload: unknown): unknown;
  statusCode?: number;
  raw?: {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
  };
}

export interface FastifyLikeInstance {
  addHook(
    name: 'onRequest' | 'onSend' | 'onResponse',
    hook: (request: FastifyLikeRequest, reply: FastifyLikeReply, payload?: unknown) => Promise<unknown> | unknown,
  ): void;
}

const stateKey = Symbol('RateGuardFastifyState');

interface FastifyState {
  request: RequestContext;
  body: string;
  startedAt: number;
}

/**
 * Fastify plugin adapter.
 */
export async function rateguardPlugin(
  instance: FastifyLikeInstance,
  options: RateGuardOptions | RateGuardRuntime = {},
): Promise<void> {
  const runtime = options instanceof RateGuardRuntime ? options : new RateGuardRuntime(options);

  instance.addHook('onRequest', async (request, reply) => {
    const requestContext = buildRequestContext(runtime, request);
    const preflight = await runtime.admit(requestContext);
    if (!preflight.allowed) {
      writeDeniedReply(reply, preflight.statusCode ?? 429, preflight.retryAfterMs ?? 0);
      return;
    }

    (request as FastifyLikeRequest & { [stateKey]?: FastifyState })[stateKey] = {
      request: requestContext,
      body: '',
      startedAt: runtime.config.clock.now(),
    };
  });

  instance.addHook('onSend', async (request, _reply, payload) => {
    const state = (request as FastifyLikeRequest & { [stateKey]?: FastifyState })[stateKey];
    if (!state) {
      return payload;
    }
    state.body = typeof payload === 'string' ? payload : payload instanceof Uint8Array ? Buffer.from(payload).toString('utf8') : '';
    return payload;
  });

  instance.addHook('onResponse', async (request, reply) => {
    const state = (request as FastifyLikeRequest & { [stateKey]?: FastifyState })[stateKey];
    if (!state) {
      return;
    }

    const statusCode = reply.statusCode ?? reply.raw?.statusCode ?? 200;
    const snapshot: ResponseSnapshot = {
      headers: reply.raw?.headers ?? {},
      body: state.body,
      statusCode,
    };
    await runtime.observe(state.request, { statusCode, snapshot }, state.startedAt);
  });
}

function buildRequestContext(runtime: RateGuardRuntime, request: FastifyLikeRequest): RequestContext {
  const path = request.url ?? '/';
  const requestId = readFirstHeader(request.headers, ['x-request-id', 'x-request-id']) || path;
  const traceId = readFirstHeader(request.headers, ['traceparent', 'x-trace-id', 'x-request-id']) || path;

  return {
    method: (request.method ?? 'GET').toUpperCase(),
    path,
    headers: request.headers,
    requestId,
    traceId,
    tenantId: runtime.config.tenantId,
    routeId: runtime.config.routeId,
    upstreamId: runtime.config.upstreamId,
    provider: runtime.config.provider,
    model: runtime.config.model,
  };
}

function writeDeniedReply(reply: FastifyLikeReply, statusCode: number, retryAfterMs: number): void {
  reply.code(statusCode);
  reply.header('content-type', 'application/json');
  if (retryAfterMs > 0) {
    reply.header('Retry-After', formatRetryAfterMs(retryAfterMs));
    reply.header('X-Retry-After-Ms', String(retryAfterMs));
  }
  reply.send({
    error: statusCode === 503 ? 'circuit_open' : 'rate_limit_exceeded',
    retry_after_ms: retryAfterMs > 0 ? retryAfterMs : undefined,
  });
}
