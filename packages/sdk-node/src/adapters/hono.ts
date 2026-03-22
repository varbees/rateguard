import { RateGuardRuntime } from '../runtime.js';
import { formatRetryAfterMs, readFirstHeader } from '../core/utils.js';
import type { RateGuardOptions, RequestContext, ResponseSnapshot } from '../types.js';

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
      return c.json(
        {
          error: preflight.statusCode === 503 ? 'circuit_open' : 'rate_limit_exceeded',
          retry_after_ms: preflight.retryAfterMs,
        },
        preflight.statusCode ?? 429,
      );
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

async function snapshotFromResponse(response: Response): Promise<ResponseSnapshot> {
  const clone = response.clone();
  const body = await clone.text();
  return {
    headers: clone.headers,
    body,
    statusCode: clone.status,
  };
}

function buildRequestContext(runtime: RateGuardRuntime, c: HonoLikeContext): RequestContext {
  const path = new URL(c.req.url).pathname;
  const requestId = readFirstHeader(
    {
      'x-request-id': c.req.header('x-request-id') ?? '',
      'x-request-id-alt': c.req.header('x-request-id') ?? '',
    },
    ['x-request-id'],
  ) || path;
  const traceId = c.req.header('traceparent') ?? c.req.header('x-trace-id') ?? requestId;

  return {
    method: c.req.method.toUpperCase(),
    path,
    headers: {
      'x-request-id': c.req.header('x-request-id') ?? undefined,
      traceparent: c.req.header('traceparent') ?? undefined,
    },
    requestId,
    traceId,
    tenantId: runtime.config.tenantId,
    routeId: runtime.config.routeId,
    upstreamId: runtime.config.upstreamId,
    provider: runtime.config.provider,
    model: runtime.config.model,
  };
}
