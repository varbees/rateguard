import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { RateGuard, createAdminHandler } from '../src/index.js';
import type { RequestContext } from '../src/types.js';

let server: Server | undefined;

function startAdmin(guard: RateGuard): Promise<string> {
  server = createServer(createAdminHandler(guard));
  return new Promise((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('expected an ephemeral TCP address'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

afterEach(() => {
  return new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server = undefined;
  });
});

function makeRequest(key: string): RequestContext {
  return {
    method: 'GET',
    path: '/hello',
    headers: {},
    requestId: 'req-1',
    traceId: 'trace-1',
    tenantId: key,
    routeId: 'root',
    upstreamId: 'local',
    provider: undefined,
    model: undefined,
  };
}

describe('admin HTTP API', () => {
  it('GET /admin/state returns list_limits-shaped data for the key (default "default")', async () => {
    const base = await startAdmin(new RateGuard({ preset: 'dev' }));

    const response = await fetch(`${base}/admin/state`);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');

    const state = (await response.json()) as Record<string, unknown>;
    expect(state.key).toBe('default');
    for (const section of ['rate_limit', 'token_budget', 'circuit_breaker', 'preset', 'loop_detector', 'guardrails']) {
      expect(state, `missing section ${section}`).toHaveProperty(section);
    }

    const withKey = await fetch(`${base}/admin/state?key=tenant-42`);
    const keyed = (await withKey.json()) as Record<string, unknown>;
    expect(keyed.key).toBe('tenant-42');
  });

  it('GET/PATCH /admin/policy round-trips a change that alters real admission decisions', async () => {
    let nowMs = 1_000_000; // frozen clock: no token refill between admits
    const guard = new RateGuard({ preset: 'dev', clock: { now: () => nowMs } });
    const base = await startAdmin(guard);

    const before = (await (await fetch(`${base}/admin/policy`)).json()) as Record<string, unknown>;
    expect(before.requestsPerSecond).toBe(10); // dev preset
    expect(before.burst).toBe(20);

    const patchResponse = await fetch(`${base}/admin/policy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests_per_second: 1, burst: 1, token_budget_mode: 'soft-stop' }),
    });
    expect(patchResponse.status).toBe(200);
    const updated = (await patchResponse.json()) as Record<string, unknown>;
    expect(updated.requestsPerSecond).toBe(1);
    expect(updated.burst).toBe(1);
    expect(updated.tokenBudgetMode).toBe('soft-stop');

    const after = (await (await fetch(`${base}/admin/policy`)).json()) as Record<string, unknown>;
    expect(after.requestsPerSecond).toBe(1);
    expect(after.burst).toBe(1);

    // The wiring is real, not cosmetic: with burst patched from 20 down to 1
    // and the clock frozen, a fresh key admits exactly one request.
    const request = makeRequest('patched-tenant');
    const first = await guard.runtime.admit(request);
    expect(first.allowed).toBe(true);
    const second = await guard.runtime.admit(request);
    expect(second.allowed).toBe(false);
    expect(second.statusCode).toBe(429);
    void nowMs;
  });

  it('PATCH /admin/policy rejects an unparseable body with 400', async () => {
    const base = await startAdmin(new RateGuard({ preset: 'dev' }));

    const response = await fetch(`${base}/admin/policy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json {',
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('invalid JSON body');
  });

  it('GET /admin/mcp/tools lists the catalog without leaking handler functions', async () => {
    const guard = new RateGuard({ preset: 'dev' });
    const base = await startAdmin(guard);

    const response = await fetch(`${base}/admin/mcp/tools`);
    expect(response.status).toBe(200);

    const tools = (await response.json()) as Array<Record<string, unknown>>;
    expect(tools.map((tool) => tool.name)).toEqual(guard.mcpTools().map((tool) => tool.name));
    for (const tool of tools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.input_schema).toBeTypeOf('object');
      expect(tool).not.toHaveProperty('handler');
      expect(tool).not.toHaveProperty('inputSchema'); // wire shape is snake_case, mirroring Go
    }
  });

  it('POST /admin/mcp/call invokes a tool and returns its result unwrapped', async () => {
    const base = await startAdmin(new RateGuard({ preset: 'dev' }));

    const response = await fetch(`${base}/admin/mcp/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'get_rate_limit_state', args: { key: 'agent-1' } }),
    });
    expect(response.status).toBe(200);

    const result = (await response.json()) as Record<string, unknown>;
    // Unwrapped tool result, not MCP's {content:[{type,text}]} envelope.
    expect(result.content).toBeUndefined();
    expect(result.key).toBe('agent-1');
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.remaining).toBe('number');
  });

  it('POST /admin/mcp/call returns 404 for an unknown tool and 400 for a handler error', async () => {
    const base = await startAdmin(new RateGuard({ preset: 'dev' }));

    const unknown = await fetch(`${base}/admin/mcp/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'nope', args: {} }),
    });
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: string }).error).toBe('unknown tool "nope"');

    const handlerError = await fetch(`${base}/admin/mcp/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // get_rate_limit_state without a key makes the tool handler throw.
      body: JSON.stringify({ tool: 'get_rate_limit_state', args: {} }),
    });
    expect(handlerError.status).toBe(400);

    const missingTool = await fetch(`${base}/admin/mcp/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: {} }),
    });
    expect(missingTool.status).toBe(400);
    expect(((await missingTool.json()) as { error: string }).error).toBe('"tool" is required');
  });

  it('OPTIONS short-circuits to 204 with CORS headers on every admin route', async () => {
    const base = await startAdmin(new RateGuard({ preset: 'dev' }));

    for (const path of ['/admin/state', '/admin/policy', '/admin/mcp/tools', '/admin/mcp/call']) {
      const response = await fetch(`${base}${path}`, { method: 'OPTIONS' });
      expect(response.status, path).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, PATCH, POST, OPTIONS');
      expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
    }
  });

  it('rejects wrong methods per route with 405 and Go-matching messages', async () => {
    const base = await startAdmin(new RateGuard({ preset: 'dev' }));

    const state = await fetch(`${base}/admin/state`, { method: 'POST' });
    expect(state.status).toBe(405);
    expect(((await state.json()) as { error: string }).error).toBe('GET only');

    const policy = await fetch(`${base}/admin/policy`, { method: 'DELETE' });
    expect(policy.status).toBe(405);
    expect(((await policy.json()) as { error: string }).error).toBe('GET or PATCH only');

    const tools = await fetch(`${base}/admin/mcp/tools`, { method: 'POST', body: '{}' });
    expect(tools.status).toBe(405);
    expect(((await tools.json()) as { error: string }).error).toBe('GET only');

    const call = await fetch(`${base}/admin/mcp/call`);
    expect(call.status).toBe(405);
    expect(((await call.json()) as { error: string }).error).toBe('POST only');

    const missing = await fetch(`${base}/admin/nope`);
    expect(missing.status).toBe(404);
  });
});
