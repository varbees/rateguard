import { RateGuardRuntime } from '../runtime.js';
import { formatRetryAfterMs, readFirstHeader } from '../core/utils.js';
import type { HeadersLike, RequestContext, ResponseSnapshot } from '../types.js';

type DenialErrorCode = 'circuit_open' | 'rate_limit_exceeded';

export interface DenialPayload {
  error: DenialErrorCode;
  retry_after_ms?: number;
}

export type DenialHeaders = Record<string, string>;

export interface AdapterRequestContextInput {
  method: string | undefined;
  path: string;
  headers: HeadersLike;
  requestIdFallback?: string;
  traceIdFallback?: string;
}

export function buildAdapterRequestContext(
  runtime: RateGuardRuntime,
  input: AdapterRequestContextInput,
): RequestContext {
  const requestId = readFirstHeader(input.headers, ['x-request-id']) || input.requestIdFallback || input.path;
  const traceId = readFirstHeader(input.headers, ['traceparent', 'x-trace-id', 'x-request-id']) || input.traceIdFallback || requestId;

  return {
    method: (input.method ?? 'GET').toUpperCase(),
    path: input.path,
    headers: input.headers,
    requestId,
    traceId,
    tenantId: runtime.config.tenantId,
    routeId: runtime.config.routeId,
    upstreamId: runtime.config.upstreamId,
    provider: runtime.config.provider,
    model: runtime.config.model,
  };
}

export function denialPayload(statusCode: number, retryAfterMs: number): DenialPayload {
  const payload: DenialPayload = {
    error: statusCode === 503 ? 'circuit_open' : 'rate_limit_exceeded',
  };
  if (retryAfterMs > 0) {
    payload.retry_after_ms = retryAfterMs;
  }
  return payload;
}

export function denialHeaders(retryAfterMs: number): DenialHeaders {
  const headers: DenialHeaders = {
    'content-type': 'application/json',
  };
  if (retryAfterMs > 0) {
    headers['Retry-After'] = formatRetryAfterMs(retryAfterMs);
    headers['X-Retry-After-Ms'] = String(retryAfterMs);
  }
  return headers;
}

export async function snapshotFromResponse(response: Response): Promise<ResponseSnapshot> {
  const clone = response.clone();
  const body = await clone.text();
  return {
    headers: clone.headers,
    body,
    statusCode: clone.status,
  };
}
