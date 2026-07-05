import { RateGuardRuntime } from '../runtime.js';
import { admissionHeaders, buildAdapterRequestContext, denialHeaders, readBoundedWebBody, resolveDenialPayload, snapshotFromResponse } from './common.js';
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

    let bodyText: string | undefined;
    if (runtime.wantsRequestBody(requestContext)) {
      bodyText = await readBoundedWebBody(request);
    }

    const preflight = await runtime.admit(requestContext, bodyText);
    const headers = admissionHeaders(runtime, preflight);

    if (!preflight.allowed) {
      const statusCode = preflight.statusCode ?? 429;
      const retryAfterMs = preflight.retryAfterMs ?? 0;
      return new Response(
        JSON.stringify(resolveDenialPayload(preflight, statusCode, retryAfterMs)),
        {
          status: statusCode,
          headers: { ...headers, ...denialHeaders(retryAfterMs) },
        },
      );
    }

    const response = await handler(request, context);
    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value);
    }
    const snapshot = await snapshotFromResponse(response);
    await runtime.observe(requestContext, {
      statusCode: response.status,
      snapshot,
      ...(preflight.tokenBudgetReservationId ? { tokenBudgetReservationId: preflight.tokenBudgetReservationId } : {}),
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
