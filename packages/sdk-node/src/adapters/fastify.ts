import { RateGuardRuntime } from '../runtime.js';
import { admissionHeaders, buildAdapterRequestContext, denialHeaders, resolveDenialPayload, resolveInspectionBodyText } from './common.js';
import type { AdapterPayload, ReadableBodySource } from './common.js';
import type { HeadersLike, PreflightDecision, RateGuardOptions, RequestContext, ResponseSnapshot } from '../types.js';

export interface FastifyLikeRequest {
  method?: string;
  url?: string;
  headers: HeadersLike;
  /** The underlying raw Node request (real Fastify exposes this as `request.raw`). */
  raw?: ReadableBodySource;
  /** Already-parsed body, when available (Fastify's own body parsing runs after onRequest, so this is typically unset when RateGuard's onRequest hook fires). */
  body?: unknown;
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

    let bodyText: string | undefined;
    if (runtime.wantsRequestBody(requestContext)) {
      bodyText = await resolveInspectionBodyText(request.body, request.raw);
    }

    const preflight = await runtime.admit(requestContext, bodyText);
    for (const [name, value] of Object.entries(admissionHeaders(runtime, preflight))) {
      reply.header(name, value);
    }

    if (!preflight.allowed) {
      writeDeniedReply(reply, preflight);
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

function writeDeniedReply(reply: FastifyLikeReply, preflight: PreflightDecision): void {
  const statusCode = preflight.statusCode ?? 429;
  const retryAfterMs = preflight.retryAfterMs ?? 0;
  reply.code(statusCode);
  for (const [name, value] of Object.entries(denialHeaders(retryAfterMs))) {
    reply.header(name, value);
  }
  reply.send(resolveDenialPayload(preflight, statusCode, retryAfterMs));
}
