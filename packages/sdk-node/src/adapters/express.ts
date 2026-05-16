import { createHash } from 'node:crypto';
import { RateGuardRuntime } from '../runtime.js';
import { formatRetryAfterMs } from '../core/utils.js';
import { buildAdapterRequestContext, denialHeaders, denialPayload } from './common.js';
import type { AdapterPayload } from './common.js';
import type { HeadersLike, RateGuardOptions, ResponseSnapshot } from '../types.js';

type ExpressResponseChunk = string | Uint8Array;
type ExpressWriteCallback = (error?: Error | null) => void;
type ExpressWriteArgs =
  | []
  | [encoding: BufferEncoding]
  | [callback: ExpressWriteCallback]
  | [encoding: BufferEncoding, callback: ExpressWriteCallback];
type ExpressEndArgs =
  | []
  | [chunk: ExpressResponseChunk]
  | [chunk: ExpressResponseChunk, encoding: BufferEncoding]
  | [chunk: ExpressResponseChunk, callback: ExpressWriteCallback]
  | [chunk: ExpressResponseChunk, encoding: BufferEncoding, callback: ExpressWriteCallback];

export interface ExpressLikeRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers: HeadersLike;
}

export interface ExpressLikeResponse {
  statusCode: number;
  write(chunk: ExpressResponseChunk, ...args: ExpressWriteArgs): boolean;
  end(...args: ExpressEndArgs): ExpressLikeResponse;
  setHeader(name: string, value: string | number | readonly string[]): ExpressLikeResponse;
  getHeader(name: string): string | number | readonly string[] | undefined;
  getHeaders(): Record<string, string | number | readonly string[] | undefined>;
  once(event: 'finish' | 'close', listener: () => void): ExpressLikeResponse;
  status?(code: number): ExpressLikeResponse;
  send?(body?: AdapterPayload): ExpressLikeResponse;
  json?(body: AdapterPayload): ExpressLikeResponse;
}

export type NextFunction = (err?: Error | 'route' | 'router') => void;

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
      writeDeniedResponse(res, preflight.statusCode ?? 429, preflight.retryAfterMs ?? 0, preflight.errorCode);
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

function buildRequestContext(runtime: RateGuardRuntime, req: ExpressLikeRequest) {
  const path = req.originalUrl ?? req.url ?? '/';
  return buildAdapterRequestContext(runtime, {
    method: req.method,
    path,
    headers: req.headers,
    requestIdFallback: hashPath(path),
    traceIdFallback: hashPath(`${path}:trace`),
  });
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

function writeDeniedResponse(res: ExpressLikeResponse, statusCode: number, retryAfterMs: number, errorCode?: Parameters<typeof denialPayload>[2]): void {
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }
  for (const [name, value] of Object.entries(denialHeaders(retryAfterMs))) {
    res.setHeader(name, value);
  }
  const payload = denialPayload(statusCode, retryAfterMs, errorCode);
  if (typeof res.json === 'function') {
    res.json(payload);
    return;
  }
  const body = JSON.stringify(payload);
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

  res.write = ((chunk: ExpressResponseChunk, ...rest: ExpressWriteArgs) => {
    pushChunk(chunks, chunk);
    return write(chunk, ...rest);
  }) as typeof res.write;

  res.end = ((...args: ExpressEndArgs) => {
    const chunk = args[0];
    if (chunk !== undefined) {
      pushChunk(chunks, chunk);
    }
    return end(...args);
  }) as typeof res.end;

  return {
    body: () => Buffer.concat(chunks).toString('utf8'),
  };
}

function pushChunk(chunks: Buffer[], chunk: ExpressResponseChunk): void {
  if (typeof chunk === 'string') {
    chunks.push(Buffer.from(chunk));
    return;
  }
  chunks.push(Buffer.from(chunk));
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
