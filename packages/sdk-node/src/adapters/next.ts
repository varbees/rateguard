import { RateGuardRuntime } from '../runtime.js';
import { buildAdapterRequestContext, denialHeaders, denialPayload, snapshotFromResponse } from './common.js';
import type { RateGuardOptions, RequestContext } from '../types.js';

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
        JSON.stringify(denialPayload(preflight.statusCode ?? 429, preflight.retryAfterMs ?? 0, preflight.errorCode)),
        {
          status: preflight.statusCode ?? 429,
          headers: denialHeaders(preflight.retryAfterMs ?? 0),
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

function buildRequestContext(runtime: RateGuardRuntime, request: Request): RequestContext {
  const url = new URL(request.url);
  return buildAdapterRequestContext(runtime, {
    method: request.method,
    path: url.pathname,
    headers: request.headers,
  });
}
