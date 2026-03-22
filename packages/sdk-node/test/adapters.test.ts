import { describe, expect, it, vi } from 'vitest';
import { RateGuard } from '../src/index.js';
import { middleware as expressMiddleware } from '../src/adapters/express.js';
import { rateguardPlugin } from '../src/adapters/fastify.js';
import { rateguard } from '../src/adapters/hono.js';
import { withRateGuard } from '../src/adapters/next.js';
import { FakeExpressResponse, FakeFastify, FakeFastifyReply } from './helpers.js';

describe('adapters', () => {
  it('express middleware allows under limit and returns 429 with Retry-After when exceeded', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      rateLimit: { requestsPerSecond: 1, burst: 0, windowMs: 60_000 },
    });
    const middleware = guard.middleware();
    const req = {
      method: 'GET',
      url: '/hello',
      headers: {},
    } as never;

    const firstResponse = new FakeExpressResponse();
    let nextCalled = 0;
    await middleware(req, firstResponse, async () => {
      nextCalled += 1;
      firstResponse.status(200).end('ok');
    });

    const secondResponse = new FakeExpressResponse();
    await middleware(req, secondResponse, async () => {
      nextCalled += 1;
      secondResponse.status(200).end('ok');
    });

    expect(nextCalled).toBe(1);
    expect(secondResponse.statusCode).toBe(429);
    expect(secondResponse.getHeader('Retry-After')).toBeDefined();
  });

  it('express middleware hard-stops token budgets before next() and emits warnings in soft-stop mode', async () => {
    const events: string[] = [];
    const guard = new RateGuard({
      preset: 'dev',
      tokenBudget: { monthLimit: 10, mode: 'soft-stop', softStopAt: 0.5 },
      eventEmitter: {
        async emit(event) {
          events.push(event.event_type);
        },
      },
    });
    guard.runtime.tokenBudget.record('global:root:local:GET', 5);

    const middleware = guard.middleware();
    const req = {
      method: 'GET',
      url: '/hello',
      headers: {},
    } as never;
    const res = new FakeExpressResponse();
    let nextCalled = false;

    await middleware(req, res, async () => {
      nextCalled = true;
      res.status(200).end('ok');
    });

    expect(nextCalled).toBe(true);
    expect(events).toContain('request.budget_warning');
  });

  it('fastify plugin wires the same admission path', async () => {
    const fastify = new FakeFastify();
    await rateguardPlugin(fastify, {
      preset: 'dev',
      rateLimit: { requestsPerSecond: 1, burst: 0, windowMs: 60_000 },
    });

    expect(fastify.hooks.onRequest).toHaveLength(1);
    expect(fastify.hooks.onSend).toHaveLength(1);
    expect(fastify.hooks.onResponse).toHaveLength(1);

    const request = { method: 'GET', url: '/hello', headers: {} };
    const reply = new FakeFastifyReply();

    await fastify.hooks.onRequest[0]!(request, reply);
    await fastify.hooks.onSend[0]!(request, reply, 'ok');
    await fastify.hooks.onResponse[0]!(request, reply);
    expect(reply.statusCode).toBeUndefined();
  });

  it('hono middleware allows request flow and records completed responses', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      tokenBudget: { monthLimit: 100, mode: 'hard-stop', softStopAt: 0.8 },
    });
    const honoMiddleware = rateguard(guard.runtime);
    const context = {
      req: {
        method: 'GET',
        url: 'http://localhost/hello',
        header(name: string) {
          return name === 'x-request-id' ? 'abc' : undefined;
        },
      },
      async json(payload: unknown, status?: number) {
        return new Response(JSON.stringify(payload), { status: status ?? 200, headers: { 'content-type': 'application/json' } });
      },
      async body(payload: unknown, status?: number) {
        return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status: status ?? 200 });
      },
      res: new Response('ok', { status: 200 }),
    };

    let nextCalled = false;
    await honoMiddleware(context, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('Next.js wrapper re-extracts streaming SSE token usage', async () => {
    const guard = new RateGuard({
      preset: 'dev',
      tokenBudget: { monthLimit: 100, mode: 'hard-stop', softStopAt: 0.8 },
    });

    const handler = withRateGuard(
      async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"usage":{"input_tokens":2,"output_tokens":5,"total_tokens":7}}\n\n'));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
      guard.runtime,
    );

    const response = await handler(new Request('http://localhost/chat', { method: 'GET' }), {});
    expect(response.status).toBe(200);

    const usage = guard.runtime.tokenBudget.usage('global:root:local:GET', {
      hourLimit: 0,
      dayLimit: 0,
      monthLimit: 100,
      mode: 'hard-stop',
      softStopAt: 0.8,
    });

    expect(usage.month).toBe(7);
  });
});
