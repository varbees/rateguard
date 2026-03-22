import { createHash } from 'node:crypto';
import { RateGuardRuntime } from '../runtime.js';
import { formatRetryAfterMs, readFirstHeader } from '../core/utils.js';
import type { HeadersLike, RateGuardOptions, RequestContext, ResponseSnapshot } from '../types.js';

export interface ExpressLikeRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers: HeadersLike;
  body?: unknown;
}

export interface ExpressLikeResponse {
  statusCode: number;
  write(chunk: unknown): boolean;
  end(chunk?: unknown): unknown;
  setHeader(name: string, value: string | number | readonly string[]): unknown;
  getHeader(name: string): string | number | readonly string[] | undefined;
  getHeaders(): Record<string, string | number | readonly string[] | undefined>;
  once(event: 'finish' | 'close', listener: () => void): unknown;
  status?(code: number): ExpressLikeResponse;
  send?(body?: unknown): ExpressLikeResponse;
  json?(body: unknown): ExpressLikeResponse;
}

export type NextFunction = (err?: unknown) => void;

/**
 * Build an Express/Connect compatible middleware.
 */
export function middleware(options: RateGuardOptions | RateGuardRuntime = {}): (
  req: ExpressLikeRequest,
  res: ExpressLikeResponse,
  next: NextFunction,
) => Promise<void> {
  const runtime = options instanceof RateGuardRuntime ? options : new RateGuardRuntime(options);
  return async (req, res, next) => {
    const request = buildRequestContext(runtime, req);
    const preflight = await runtime.admit(request);
    if (!preflight.allowed) {
      writeAdmissionHeaders(res, runtime, preflight.rateLimit?.limit ?? runtime.config.rateLimit.requestsPerSecond + runtime.config.rateLimit.burst, preflight.rateLimit?.remaining ?? 0, runtime.config.rateLimit.burst, preflight.retryAfterMs ?? 0);
      writeDeniedResponse(res, preflight.statusCode ?? 429, preflight.retryAfterMs ?? 0);
      return;
    }

    writeAdmissionHeaders(res, runtime, preflight.rateLimit?.limit ?? runtime.config.rateLimit.requestsPerSecond + runtime.config.rateLimit.burst, preflight.rateLimit?.remaining ?? 0, runtime.config.rateLimit.burst, 0);

    const capture = patchResponse(res);
    const startedAt = runtime.config.clock.now();
    let finalized = false;
    let complete!: () => void;
    const finished = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const finalize = async (statusCode: number, error?: Error) => {
      if (finalized) {
        return;
      }
      finalized = true;
      const snapshot = buildSnapshot(res, capture.body());
      try {
        await runtime.observe(request, {
          statusCode,
          snapshot,
          error,
        }, startedAt);
      } finally {
        complete();
      }
    };

    const onFinished = () => {
      const statusCode = res.statusCode || 200;
      void finalize(statusCode);
    };

    res.once('finish', onFinished);
    res.once('close', onFinished);

    try {
      await Promise.resolve(next());
      await finished;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await finalize(res.statusCode || 500, err);
      await finished;
      throw err;
    }
  };
}

function buildRequestContext(runtime: RateGuardRuntime, req: ExpressLikeRequest): RequestContext {
  const path = req.originalUrl ?? req.url ?? '/';
  const requestId = readFirstHeader(req.headers, ['x-request-id', 'x-request-id']) || hashPath(path);
  const traceId = readFirstHeader(req.headers, ['traceparent', 'x-trace-id', 'x-trace-id', 'x-request-id']) || hashPath(`${path}:trace`);

  return {
    method: (req.method ?? 'GET').toUpperCase(),
    path,
    headers: req.headers,
    requestId,
    traceId,
    tenantId: runtime.config.tenantId,
    routeId: runtime.config.routeId,
    upstreamId: runtime.config.upstreamId,
    provider: runtime.config.provider,
    model: runtime.config.model,
  };
}

function writeAdmissionHeaders(res: ExpressLikeResponse, runtime: RateGuardRuntime, limit: number, remaining: number, burst: number, retryAfterMs: number): void {
  res.setHeader('X-RateGuard-Preset', runtime.config.preset.name);
  res.setHeader('X-RateGuard-Limit', String(limit));
  res.setHeader('X-RateGuard-Burst', String(burst));
  res.setHeader('X-RateGuard-Remaining', String(Math.max(0, remaining)));
  if (retryAfterMs > 0) {
    res.setHeader('Retry-After', formatRetryAfterMs(retryAfterMs));
  }
}

function writeDeniedResponse(res: ExpressLikeResponse, statusCode: number, retryAfterMs: number): void {
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }
  res.setHeader('content-type', 'application/json');
  if (retryAfterMs > 0) {
    res.setHeader('Retry-After', formatRetryAfterMs(retryAfterMs));
    res.setHeader('X-Retry-After-Ms', String(retryAfterMs));
  }
  const body = JSON.stringify({
    error: statusCode === 503 ? 'circuit_open' : 'rate_limited',
    retry_after: retryAfterMs > 0 ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : undefined,
    message: statusCode === 503 ? 'RateGuard opened the circuit breaker.' : 'RateGuard rate limited this request.',
  });
  if (typeof res.json === 'function') {
    res.json(JSON.parse(body));
    return;
  }
  if (typeof res.send === 'function') {
    res.send(body);
    return;
  }
  res.end(body);
}

function patchResponse(res: ExpressLikeResponse): {
  body: () => string;
} {
  const chunks: Buffer[] = [];
  const write = res.write.bind(res);
  const end = res.end.bind(res);

  res.write = ((chunk: unknown, ...rest: readonly unknown[]) => {
    pushChunk(chunks, chunk);
    return write(chunk as never, ...(rest as []));
  }) as typeof res.write;

  res.end = ((chunk?: unknown, ...rest: readonly unknown[]) => {
    if (chunk !== undefined) {
      pushChunk(chunks, chunk);
    }
    return end(chunk as never, ...(rest as []));
  }) as typeof res.end;

  return {
    body: () => Buffer.concat(chunks).toString('utf8'),
  };
}

function pushChunk(chunks: Buffer[], chunk: unknown): void {
  if (chunk === undefined || chunk === null) {
    return;
  }
  if (typeof chunk === 'string') {
    chunks.push(Buffer.from(chunk));
    return;
  }
  if (chunk instanceof Uint8Array) {
    chunks.push(Buffer.from(chunk));
  }
}

function buildSnapshot(res: ExpressLikeResponse, body: string): ResponseSnapshot {
  return {
    headers: headersSnapshot(res),
    body,
    statusCode: res.statusCode || 200,
  };
}

function headersSnapshot(res: ExpressLikeResponse): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};
  const rawHeaders = res.getHeaders();
  for (const [key, value] of Object.entries(rawHeaders)) {
    headers[key] = Array.isArray(value) ? value.map(String) : value === undefined ? undefined : String(value);
  }
  return headers;
}

function hashPath(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
