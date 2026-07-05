import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HTTPEventEmitter, createEventEmitter, buildEventEnvelope } from '../src/core/event-emitter.js';
import { resolveRateGuardOptions } from '../src/config.js';
import type { RateGuardEventPayload } from '../src/types.js';

function samplePayload(): RateGuardEventPayload {
  return {
    method: 'GET',
    path: '/hello',
    status_code: 200,
    latency_ms: 5,
    rate_limit_applied: true,
    rate_limit_allowed: true,
    rate_limit_limit: 10,
    rate_limit_remaining: 9,
    retry_after_ms: undefined,
    preset: 'dev',
    circuit_breaker_state: 'closed',
    queue_depth: 0,
    token_provider: undefined,
    token_model: undefined,
    token_input_tokens: undefined,
    token_output_tokens: undefined,
    token_total_tokens: undefined,
    token_budget_mode: undefined,
    token_budget_applied: false,
    token_budget_queued: false,
    token_budget_wait_ms: undefined,
    token_budget_limit: undefined,
    token_budget_remaining: undefined,
  };
}

describe('HTTPEventEmitter', () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('POSTs the JSON event envelope with the expected headers to the configured endpoint', async () => {
    const received: { body: string; headers: Record<string, string | string[] | undefined>; method: string | undefined } = {
      body: '',
      headers: {},
      method: undefined,
    };

    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        received.body = Buffer.concat(chunks).toString('utf8');
        received.headers = req.headers;
        received.method = req.method;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server!.address() as AddressInfo).port;
    const endpoint = `http://127.0.0.1:${port}/events`;

    const emitter = new HTTPEventEmitter(endpoint);
    const envelope = buildEventEnvelope('request.completed', samplePayload(), {
      tenantId: 'global',
      routeId: 'root',
      upstreamId: 'local',
      traceId: 'trace-1',
    });

    await emitter.emit(envelope);

    expect(received.method).toBe('POST');
    expect(received.headers['content-type']).toBe('application/json');
    expect(received.headers['user-agent']).toBe('RateGuard-Node-SDK/0.1');
    const parsed = JSON.parse(received.body) as typeof envelope;
    expect(parsed.event_type).toBe('request.completed');
    expect(parsed.payload.path).toBe('/hello');
    expect(parsed.trace_id).toBe('trace-1');
  });

  it('does not throw when the endpoint responds with an error status', async () => {
    server = createServer((_req, res) => {
      res.writeHead(500);
      res.end('boom');
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server!.address() as AddressInfo).port;

    const emitter = new HTTPEventEmitter(`http://127.0.0.1:${port}/events`);
    const envelope = buildEventEnvelope('request.completed', samplePayload(), {});

    await expect(emitter.emit(envelope)).resolves.toBeUndefined();
  });

  it('does not throw when the endpoint is unreachable', async () => {
    const emitter = new HTTPEventEmitter('http://127.0.0.1:1/unreachable');
    const envelope = buildEventEnvelope('request.completed', samplePayload(), {});
    await expect(emitter.emit(envelope)).resolves.toBeUndefined();
  });

  it('createEventEmitter prefers eventEndpoint over wsUrl when no eventEmitter override is set', () => {
    const options = resolveRateGuardOptions({ eventEndpoint: 'https://example.com/hook', wsUrl: 'wss://example.com/ws' });
    const emitter = createEventEmitter(options);
    expect(emitter).toBeInstanceOf(HTTPEventEmitter);
  });
});
