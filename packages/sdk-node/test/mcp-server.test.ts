import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { RateGuard, serveMCP, MCP_PROTOCOL_VERSION } from '../src/index.js';

interface JSONRPCResponse {
  jsonrpc: string;
  id?: unknown;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/** Pipes newline-delimited JSON-RPC lines through serveMCP and returns the parsed responses. */
async function drive(guard: RateGuard, lines: string[]): Promise<JSONRPCResponse[]> {
  const chunks: string[] = [];
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  const stdin = Readable.from(lines.map((line) => line + '\n'));

  await serveMCP(guard, stdin, stdout);

  return chunks
    .join('')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JSONRPCResponse);
}

describe('MCP stdio server', () => {
  it('serves initialize, tools/list, and tools/call over newline-delimited JSON-RPC', async () => {
    const guard = new RateGuard({ preset: 'dev' });
    const responses = await drive(guard, [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_rate_limit_state', arguments: { key: 'agent-1' } },
      }),
    ]);

    // The notification must not produce a response line.
    expect(responses).toHaveLength(4);

    const init = responses.find((r) => r.id === 1)!;
    expect(init.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'rateguard' },
    });

    const ping = responses.find((r) => r.id === 2)!;
    expect(ping.result).toEqual({});

    const list = responses.find((r) => r.id === 3)!;
    const listed = (list.result!.tools as Array<{ name: string }>).map((tool) => tool.name);
    expect(listed).toEqual(guard.mcpTools().map((tool) => tool.name));

    const call = responses.find((r) => r.id === 4)!;
    expect(call.result!.isError).toBe(false);
    const content = call.result!.content as Array<{ type: string; text: string }>;
    const state = JSON.parse(content[0]!.text) as Record<string, unknown>;
    expect(state.key).toBe('agent-1');
    expect(typeof state.allowed).toBe('boolean');
    // Pre-flight peek semantics: querying must not consume a token.
    expect(state.remaining).toBe(guard.runtime.config.rateLimit.burst);
  });

  it('returns -32601 for unknown methods but stays silent for unknown notifications', async () => {
    const guard = new RateGuard({ preset: 'dev' });
    const responses = await drive(guard, [
      JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'resources/list' }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/nonexistent' }),
    ]);

    expect(responses).toHaveLength(1);
    expect(responses[0]!.id).toBe(7);
    expect(responses[0]!.error?.code).toBe(-32601);
    expect(responses[0]!.error?.message).toContain('resources/list');
  });

  it('returns -32700 for unparseable lines and keeps serving afterwards', async () => {
    const guard = new RateGuard({ preset: 'dev' });
    const responses = await drive(guard, [
      'this is not json {',
      JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'ping' }),
    ]);

    expect(responses).toHaveLength(2);
    expect(responses[0]!.error?.code).toBe(-32700);
    expect(responses[0]!.id).toBeUndefined();
    expect(responses[1]!.id).toBe(8);
    expect(responses[1]!.result).toEqual({});
  });

  it('returns -32602 when tools/call is missing params.name', async () => {
    const guard = new RateGuard({ preset: 'dev' });
    const responses = await drive(guard, [
      JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: '' } }),
    ]);

    expect(responses).toHaveLength(2);
    for (const response of responses) {
      expect(response.error?.code).toBe(-32602);
      expect(response.error?.message).toContain('params.name');
    }
  });

  it('reports tool-level failures in-band with isError, not as protocol errors', async () => {
    const guard = new RateGuard({ preset: 'dev' });
    const responses = await drive(guard, [
      JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'no_such_tool' } }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        // get_rate_limit_state without a key makes the tool handler throw.
        params: { name: 'get_rate_limit_state', arguments: {} },
      }),
    ]);

    expect(responses).toHaveLength(2);
    for (const response of responses) {
      expect(response.error).toBeUndefined();
      expect(response.result!.isError).toBe(true);
      const content = response.result!.content as Array<{ type: string; text: string }>;
      expect(content[0]!.type).toBe('text');
      expect(content[0]!.text.length).toBeGreaterThan(0);
    }
  });
});
