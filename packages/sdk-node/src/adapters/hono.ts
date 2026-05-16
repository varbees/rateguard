import { RateGuardRuntime } from '../runtime.js';
import { buildAdapterRequestContext, denialPayload, snapshotFromResponse } from './common.js';
import type { RateGuardOptions, RequestContext } from '../types.js';

export interface HonoLikeRequest {
  method: string;
  url: string;
  header(name: string): string | undefined;
}

export interface HonoLikeContext {
  req: HonoLikeRequest;
  body(payload: unknown, status?: number): Response | Promise<Response>;
  json(payload: unknown, status?: number): Response | Promise<Response>;
  res?: Response;
}

/**
 * Hono middleware adapter.
 */
export function rateguard(options: RateGuardOptions | RateGuardRuntime = {}) {
  const runtime = options instanceof RateGuardRuntime ? options : new RateGuardRuntime(options);

  return async (c: HonoLikeContext, next: () => Promise<void>): Promise<Response | void> => {
    const request = buildRequestContext(runtime, c);
    const startedAt = runtime.config.clock.now();
    const preflight = await runtime.admit(request);
    if (!preflight.allowed) {
      return c.json(denialPayload(preflight.statusCode ?? 429, preflight.retryAfterMs ?? 0), preflight.statusCode ?? 429);
    }

    await next();

    const response = c.res;
    if (!response) {
      return undefined;
    }

    const snapshot = await snapshotFromResponse(response);
    await runtime.observe(request, {
      statusCode: response.status,
      snapshot,
    }, startedAt);
    return response;
  };
}

function buildRequestContext(runtime: RateGuardRuntime, c: HonoLikeContext): RequestContext {
  const path = new URL(c.req.url).pathname;
  return buildAdapterRequestContext(runtime, {
    method: c.req.method,
    path,
    headers: {
      'x-request-id': c.req.header('x-request-id') ?? undefined,
      traceparent: c.req.header('traceparent') ?? undefined,
      'x-trace-id': c.req.header('x-trace-id') ?? undefined,
    },
  });
}
