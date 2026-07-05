import { MAX_INSPECTED_BODY_BYTES, RateGuardRuntime } from '../runtime.js';
import { formatRetryAfterMs, readFirstHeader } from '../core/utils.js';
import type { AdmissionErrorCode, HeadersLike, PreflightDecision, RequestContext, ResponseSnapshot } from '../types.js';

export { MAX_INSPECTED_BODY_BYTES };

type DenialErrorCode = AdmissionErrorCode;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue | undefined } | JsonValue[];
export type AdapterPayload = BodyInit | JsonValue | undefined;

export type DenialPayload = {
  [key: string]: JsonValue | undefined;
  error: DenialErrorCode;
  retry_after_ms?: number;
};

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

export function denialPayload(statusCode: number, retryAfterMs: number, errorCode?: DenialErrorCode): DenialPayload {
  const payload: DenialPayload = {
    error: errorCode ?? (statusCode === 503 ? 'circuit_open' : 'rate_limit_exceeded'),
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

/**
 * IETF RateLimit-* response headers (draft-ietf-httpapi-ratelimit-headers)
 * plus RateGuard's own X-RateGuard-* headers, computed once so all 4
 * adapters render identical headers and can never drift from each other.
 * Mirrors Go's sdk.go applyHeaders.
 */
export function admissionHeaders(runtime: RateGuardRuntime, preflight: PreflightDecision): DenialHeaders {
  const rateLimit = preflight.rateLimit;
  const limit = rateLimit?.limit ?? runtime.config.rateLimit.requestsPerSecond + runtime.config.rateLimit.burst;
  const remaining = Math.max(0, rateLimit?.remaining ?? 0);
  const burst = runtime.config.rateLimit.burst;
  const retryAfterMs = preflight.retryAfterMs ?? 0;

  const headers: DenialHeaders = {
    'X-RateGuard-Preset': runtime.config.preset.name,
    'X-RateGuard-Limit': String(limit),
    'X-RateGuard-Burst': String(burst),
    'X-RateGuard-Remaining': String(remaining),
  };

  // Only set when the rate limiter actually applied to this request —
  // mirrors Go's `if decision.Applied`.
  if (rateLimit?.applied) {
    headers['RateLimit-Limit'] = String(rateLimit.limit);
    headers['RateLimit-Remaining'] = String(Math.max(0, rateLimit.remaining));
    // Same whole-second ceiling as Retry-After/formatRetryAfterMs, except
    // zero stays zero (Go's ceilDurationSeconds(d<=0) == 0) rather than
    // floored up to 1 the way formatRetryAfterMs floors Retry-After.
    headers['RateLimit-Reset'] = retryAfterMs > 0 ? formatRetryAfterMs(retryAfterMs) : '0';
  }

  return headers;
}

/**
 * Picks the response body for a denied request: the pre-built
 * `{error, message}` payload for loop-detection/guardrail rejections when
 * present, otherwise the standard `{error, retry_after_ms?}` shape.
 */
export function resolveDenialPayload(
  preflight: PreflightDecision,
  statusCode: number,
  retryAfterMs: number,
): DenialPayload | { error: string; message: string } {
  if (preflight.rejectionPayload) {
    return preflight.rejectionPayload;
  }
  return denialPayload(statusCode, retryAfterMs, preflight.errorCode);
}

/** Minimal duck-type for a Node.js readable body stream (IncomingMessage-like). */
export interface ReadableBodySource {
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
  unshift?(chunk: Buffer | Uint8Array | string): void;
  pause?(): void;
}

/**
 * Reads a Node.js stream-style request body, capped at `maxBytes`.
 *
 * IMPORTANT: `Readable.unshift()` only works BEFORE the stream's natural
 * 'end' fires — calling it afterward corrupts the stream (an unrecoverable
 * "stream.unshift() after end event" error on the next reader), verified
 * empirically against Node's stream implementation. So this only unshifts
 * when it stops EARLY (body >= maxBytes): it reads up to the cap, pauses,
 * and unshifts the consumed prefix back so a downstream body-parser sees
 * [our prefix] + [the untouched remainder of the live stream] — the exact
 * byte-for-byte body, matching Go's io.LimitReader + MultiReader
 * composition. When the body is SMALLER than maxBytes, the stream reaches
 * 'end' naturally during our read; in that case unshifting is unsafe, so
 * this returns the (fully-drained) text as-is. Prefer
 * `resolveInspectionBodyText()` when an already-parsed body may be
 * available — it skips touching the stream entirely.
 */
export async function readBoundedRequestBody(
  stream: ReadableBodySource | undefined,
  maxBytes: number = MAX_INSPECTED_BODY_BYTES,
): Promise<string> {
  if (!stream || typeof stream.on !== 'function') {
    return '';
  }

  return new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    function finish(value: string): void {
      if (settled) {
        return;
      }
      settled = true;
      stream?.removeListener?.('data', onData);
      stream?.removeListener?.('end', onEnd);
      stream?.removeListener?.('error', onError);
      resolve(value);
    }

    const onData = (chunk: unknown) => {
      if (settled) {
        return;
      }
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array);
      chunks.push(buf);
      total += buf.length;

      if (total >= maxBytes) {
        const buffered = Buffer.concat(chunks);
        stream?.pause?.();
        if (typeof stream?.unshift === 'function') {
          stream.unshift(buffered);
        }
        finish(buffered.subarray(0, maxBytes).toString('utf8'));
      }
    };
    const onEnd = () => {
      finish(Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8'));
    };
    const onError = () => finish('');

    stream.on!('data', onData);
    stream.on!('end', onEnd);
    stream.on!('error', onError);
  });
}

/**
 * Resolves body text for loop-detection/guardrail inspection, preferring
 * an already-parsed body (the safe, zero-stream-risk path — the common
 * case when a body-parser runs ahead of RateGuard in the middleware
 * chain) over reading the raw request stream.
 */
export async function resolveInspectionBodyText(
  preParsedBody: unknown,
  stream: ReadableBodySource | undefined,
  maxBytes: number = MAX_INSPECTED_BODY_BYTES,
): Promise<string> {
  if (typeof preParsedBody === 'string') {
    return preParsedBody.slice(0, maxBytes);
  }
  if (preParsedBody !== undefined && preParsedBody !== null) {
    try {
      return JSON.stringify(preParsedBody).slice(0, maxBytes);
    } catch {
      // Not serializable — fall through to the raw stream.
    }
  }
  return readBoundedRequestBody(stream, maxBytes);
}

/**
 * Reads a Web API Request body (Hono/Next adapters) capped at `maxBytes`,
 * without disturbing the original request: it reads from a `clone()`
 * (Fetch API streams are tee'd on clone), so the caller's original request
 * is left completely untouched — verified empirically: the original's
 * `.text()` still returns the full body afterward regardless of what we do
 * to the clone's reader. True bounded read (stops early instead of
 * draining) — no re-injection needed, unlike the Node-stream adapters.
 *
 * Note: `reader.cancel()` on a partially-read stream can hang indefinitely
 * in Node's undici (verified empirically) even though it doesn't affect
 * the original request either way, so it's fired-and-forgotten rather than
 * awaited — awaiting it would stall the request on every call.
 */
export async function readBoundedWebBody(
  request: Request | undefined,
  maxBytes: number = MAX_INSPECTED_BODY_BYTES,
): Promise<string> {
  if (!request) {
    return '';
  }

  const clone = request.clone();
  if (!clone.body) {
    try {
      const text = await clone.text();
      return text.slice(0, maxBytes);
    } catch {
      return '';
    }
  }

  const reader = clone.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
  } catch {
    return '';
  } finally {
    reader.cancel().catch(() => {
      // best-effort, fire-and-forget — see note above on why this isn't awaited.
    });
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return buffer.subarray(0, maxBytes).toString('utf8');
}
