import { RateGuardRuntime } from '../runtime.js';
import { admissionHeaders, buildAdapterRequestContext, readBoundedWebBody, resolveDenialPayload, snapshotFromResponse } from './common.js';
import type { AdapterPayload } from './common.js';
import type { RateGuardOptions, RequestContext } from '../types.js';

export interface HonoLikeRequest {
  method: string;
  url: string;
  header(name: string): string | undefined;
  /** The underlying standard Fetch API Request (real Hono exposes this as `c.req.raw`). */
  raw?: Request;
}

export interface HonoLikeContext {
  req: HonoLikeRequest;
  body(payload: AdapterPayload, status?: number): Response | Promise<Response>;
  json(payload: AdapterPayload, status?: number): Response | Promise<Response>;
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

    let bodyText: string | undefined;
    if (runtime.wantsRequestBody(request)) {
      bodyText = await readBoundedWebBody(c.req.raw);
    }

    const preflight = await runtime.admit(request, bodyText);
    const headers = admissionHeaders(runtime, preflight);

    if (!preflight.allowed) {
      const statusCode = preflight.statusCode ?? 429;
      const retryAfterMs = preflight.retryAfterMs ?? 0;
      const response = await c.json(resolveDenialPayload(preflight, statusCode, retryAfterMs), statusCode);
      applyHeaders(response, headers);
      return response;
    }

    await next();

    const response = c.res;
    if (!response) {
      return undefined;
    }
    applyHeaders(response, headers);

    const snapshot = await snapshotFromResponse(response);
    await runtime.observe(request, {
      statusCode: response.status,
      snapshot,
      ...(preflight.tokenBudgetReservationId ? { tokenBudgetReservationId: preflight.tokenBudgetReservationId } : {}),
    }, startedAt);
    return response;
  };
}

function applyHeaders(response: Response, headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
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
      'x-sequence-depth': c.req.header('x-sequence-depth') ?? undefined,
      'x-payload-fingerprint': c.req.header('x-payload-fingerprint') ?? undefined,
    },
  });
}
