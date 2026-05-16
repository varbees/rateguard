import { EventEmitter } from 'node:events';
import type { AdapterPayload } from '../src/adapters/common.js';
import type { ExpressLikeResponse } from '../src/adapters/express.js';
import type { FastifyLikeInstance, FastifyLikeReply, FastifyLikeRequest } from '../src/adapters/fastify.js';
import type { DenialPayload } from '../src/adapters/common.js';

type ExpressResponseChunk = Parameters<ExpressLikeResponse['write']>[0];
type ExpressEndArgs = Parameters<ExpressLikeResponse['end']>;
type FastifyHook = Parameters<FastifyLikeInstance['addHook']>[1];

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

  write(chunk: ExpressResponseChunk): boolean {
    if (typeof chunk === 'string') {
      this.chunks.push(chunk);
    } else if (chunk instanceof Uint8Array) {
      this.chunks.push(Buffer.from(chunk).toString('utf8'));
    }
    return true;
  }

  end(...args: ExpressEndArgs): this {
    const chunk = args[0];
    if (chunk !== undefined) {
      void this.write(chunk);
    }
    this.emit('finish');
    return this;
  }

  send(body?: AdapterPayload): this {
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

  json(body: AdapterPayload): this {
    return this.send(JSON.stringify(body));
  }

  body(): string {
    return this.chunks.join('');
  }
}

export class FakeFastify implements FastifyLikeInstance {
  readonly hooks: {
    onRequest: FastifyHook[];
    onSend: FastifyHook[];
    onResponse: FastifyHook[];
  } = {
    onRequest: [],
    onSend: [],
    onResponse: [],
  };

  addHook(
    name: 'onRequest' | 'onSend' | 'onResponse',
    hook: FastifyHook,
  ): void {
    if (name === 'onRequest') {
      this.hooks.onRequest.push(hook);
      return;
    }
    if (name === 'onSend') {
      this.hooks.onSend.push(hook);
      return;
    }
    this.hooks.onResponse.push(hook);
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

  send(payload: AdapterPayload): AdapterPayload {
    return payload;
  }
}
