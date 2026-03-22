import { EventEmitter } from 'node:events';
import type { ExpressLikeResponse } from '../src/adapters/express.js';
import type { FastifyLikeInstance, FastifyLikeReply, FastifyLikeRequest } from '../src/adapters/fastify.js';

export class FakeExpressResponse extends EventEmitter implements ExpressLikeResponse {
  statusCode = 200;
  private readonly headers = new Map<string, string>();
  private readonly chunks: string[] = [];

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value));
    return this;
  }

  getHeader(name: string): string | number | string[] | undefined {
    return this.headers.get(name.toLowerCase());
  }

  getHeaders(): Record<string, string> {
    return Object.fromEntries(this.headers);
  }

  write(chunk: unknown): boolean {
    if (typeof chunk === 'string') {
      this.chunks.push(chunk);
    } else if (chunk instanceof Uint8Array) {
      this.chunks.push(Buffer.from(chunk).toString('utf8'));
    }
    return true;
  }

  end(chunk?: unknown): this {
    if (chunk !== undefined) {
      void this.write(chunk);
    }
    this.emit('finish');
    return this;
  }

  send(body?: unknown): this {
    if (body !== undefined) {
      if (typeof body === 'string') {
        this.chunks.push(body);
      } else {
        this.chunks.push(JSON.stringify(body));
      }
    }
    this.emit('finish');
    return this;
  }

  json(body: unknown): this {
    return this.send(JSON.stringify(body));
  }

  body(): string {
    return this.chunks.join('');
  }
}

export class FakeFastify implements FastifyLikeInstance {
  readonly hooks: {
    onRequest: Array<(request: FastifyLikeRequest, reply: FastifyLikeReply) => Promise<unknown> | unknown>;
    onSend: Array<(request: FastifyLikeRequest, reply: FastifyLikeReply, payload?: unknown) => Promise<unknown> | unknown>;
    onResponse: Array<(request: FastifyLikeRequest, reply: FastifyLikeReply) => Promise<unknown> | unknown>;
  } = {
    onRequest: [],
    onSend: [],
    onResponse: [],
  };

  addHook(
    name: 'onRequest' | 'onSend' | 'onResponse',
    hook: (request: FastifyLikeRequest, reply: FastifyLikeReply, payload?: unknown) => Promise<unknown> | unknown,
  ): void {
    if (name === 'onRequest') {
      this.hooks.onRequest.push(hook as (request: FastifyLikeRequest, reply: FastifyLikeReply) => Promise<unknown> | unknown);
      return;
    }
    if (name === 'onSend') {
      this.hooks.onSend.push(hook);
      return;
    }
    this.hooks.onResponse.push(hook as (request: FastifyLikeRequest, reply: FastifyLikeReply) => Promise<unknown> | unknown);
  }
}

export class FakeFastifyReply implements FastifyLikeReply {
  statusCode?: number;
  readonly headers: Record<string, string> = {};

  code(statusCode: number): FastifyLikeReply {
    this.statusCode = statusCode;
    return this;
  }

  header(name: string, value: string): FastifyLikeReply {
    this.headers[name] = value;
    return this;
  }

  send(payload: unknown): unknown {
    return payload;
  }
}
