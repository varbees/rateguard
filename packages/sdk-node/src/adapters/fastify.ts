import { RateGuardRuntime } from '../runtime.js';
import { buildAdapterRequestContext, denialHeaders, denialPayload } from './common.js';
import type { AdapterPayload } from './common.js';
import type { HeadersLike, RateGuardOptions, RequestContext, ResponseSnapshot } from '../types.js';

export interface FastifyLikeRequest {
  method?: string;
  url?: string;
  headers: HeadersLike;
}

export interface FastifyLikeReply {
  code(statusCode: number): FastifyLikeReply;
  header(name: string, value: string): FastifyLikeReply;
  send(payload: AdapterPayload): AdapterPayload;
  statusCode?: number;
  raw?: {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
  };
}

export interface FastifyLikeInstance {
  addHook(
    name: 'onRequest' | 'onSend' | 'onResponse',
    hook: (request: FastifyLikeRequest, reply: FastifyLikeReply, payload?: AdapterPayload) => Promise<AdapterPayload | void> | AdapterPayload | void,
  ): void;
}

const stateKey = Symbol('RateGuardFastifyState');

interface FastifyState {
  request: RequestContext;
  body: string;
  startedAt: number;
  tokenBudgetReservationId?: string;
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
      writeDeniedReply(reply, preflight.statusCode ?? 429, preflight.retryAfterMs ?? 0, preflight.errorCode);
      return;
    }

    const state: FastifyState = {
      request: requestContext,
      body: '',
      startedAt: runtime.config.clock.now(),
    };
    if (preflight.tokenBudgetReservationId) {
      state.tokenBudgetReservationId = preflight.tokenBudgetReservationId;
    }
    (request as FastifyLikeRequest & { [stateKey]?: FastifyState })[stateKey] = state;
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
    await runtime.observe(state.request, {
      statusCode,
      snapshot,
      ...(state.tokenBudgetReservationId ? { tokenBudgetReservationId: state.tokenBudgetReservationId } : {}),
    }, state.startedAt);
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

function writeDeniedReply(reply: FastifyLikeReply, statusCode: number, retryAfterMs: number, errorCode?: Parameters<typeof denialPayload>[2]): void {
  reply.code(statusCode);
  for (const [name, value] of Object.entries(denialHeaders(retryAfterMs))) {
    reply.header(name, value);
  }
  reply.send(denialPayload(statusCode, retryAfterMs, errorCode));
}
