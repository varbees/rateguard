import { RateGuardRuntime } from '../runtime.js';
import { formatRetryAfterMs, readFirstHeader } from '../core/utils.js';
import type { RateGuardOptions, RequestContext, ResponseSnapshot } from '../types.js';

export type NextRouteHandler<TContext = Record<string, never>> = (
  request: Request,
  context: TContext,
) => Response | Promise<Response>;

/**
 * Wrap a Next.js route handler with RateGuard admission control.
 */
export function withRateGuard<TContext = Record<string, never>>(
  handler: NextRouteHandler<TContext>,
  options: RateGuardOptions | RateGuardRuntime = {},
): NextRouteHandler<TContext> {
  const runtime = options instanceof RateGuardRuntime ? options : new RateGuardRuntime(options);

  return async (request, context) => {
    const requestContext = buildRequestContext(runtime, request);
    const startedAt = runtime.config.clock.now();
    const preflight = await runtime.admit(requestContext);
    if (!preflight.allowed) {
      return new Response(
        JSON.stringify({
          error: preflight.statusCode === 503 ? 'circuit_open' : 'rate_limit_exceeded',
          retry_after_ms: preflight.retryAfterMs,
        }),
        {
          status: preflight.statusCode ?? 429,
          headers: buildHeaders(preflight.retryAfterMs ?? 0),
        },
      );
    }

    const response = await handler(request, context);
    const snapshot = await snapshotFromResponse(response);
    await runtime.observe(requestContext, {
      statusCode: response.status,
      snapshot,
    }, startedAt);
    return response;
  };
}

function buildHeaders(retryAfterMs: number): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (retryAfterMs > 0) {
    headers['Retry-After'] = formatRetryAfterMs(retryAfterMs);
    headers['X-Retry-After-Ms'] = String(retryAfterMs);
  }
  return headers;
}

function buildRequestContext(runtime: RateGuardRuntime, request: Request): RequestContext {
  const url = new URL(request.url);
  const requestId = readFirstHeader(request.headers, ['x-request-id']) || url.pathname;
  const traceId = readFirstHeader(request.headers, ['traceparent', 'x-trace-id', 'x-request-id']) || requestId;

  return {
    method: request.method.toUpperCase(),
    path: url.pathname,
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

async function snapshotFromResponse(response: Response): Promise<ResponseSnapshot> {
  const clone = response.clone();
  const body = await clone.text();
  return {
    headers: clone.headers,
    body,
    statusCode: clone.status,
  };
}
