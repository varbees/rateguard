import { RateGuardRuntime } from '../runtime.js';
import { buildAdapterRequestContext, denialHeaders, denialPayload } from './common.js';
import type { HeadersLike, RateGuardOptions, RequestContext, ResponseSnapshot } from '../types.js';

export interface FastifyLikeRequest {
  method?: string;
  url?: string;
  headers: HeadersLike;
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
  return buildAdapterRequestContext(runtime, {
    method: request.method,
    path,
    headers: request.headers,
  });
}

function writeDeniedReply(reply: FastifyLikeReply, statusCode: number, retryAfterMs: number): void {
  reply.code(statusCode);
  for (const [name, value] of Object.entries(denialHeaders(retryAfterMs))) {
    reply.header(name, value);
  }
  reply.send(denialPayload(statusCode, retryAfterMs));
}
