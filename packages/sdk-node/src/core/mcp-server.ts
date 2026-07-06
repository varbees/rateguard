/**
 * MCP stdio server — zero-dependency newline-delimited JSON-RPC 2.0.
 * Node port of Go's mcp_server.go (packages/sdk-go).
 *
 * serveMCP speaks the Model Context Protocol stdio transport: newline-
 * delimited JSON-RPC 2.0 messages on stdin/stdout. Any MCP client (Claude
 * Code, Claude Desktop, Cursor, custom agents) can connect RateGuard as a
 * tool server:
 *
 *   {"mcpServers": {"rateguard": {"command": "node", "args": ["your-mcp-entry.js"]}}}
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-06-18
 * Methods implemented: initialize, notifications/initialized,
 * notifications/cancelled, ping, tools/list, tools/call. Everything else
 * returns -32601 (method not found). Notifications (id-less messages) never
 * get responses — including unknown notification methods.
 */

import { createInterface } from 'node:readline';

import type { MCPTool, MCPToolResult } from './mcp.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const MCP_SERVER_NAME = 'rateguard';

export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;

interface JSONRPCRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * The slice of the RateGuard facade the server needs — structural so the
 * server can be driven by the RateGuard class or anything shaped like it,
 * and shares that instance's limiter/budget/breaker state.
 */
export interface MCPServerHost {
  mcpTools(): MCPTool[];
  mcpCall(toolName: string, args?: Record<string, unknown>): Promise<MCPToolResult>;
}

/**
 * Runs an MCP stdio server over the given streams until the input closes.
 * Defaults to process.stdin/process.stdout; both are injectable so tests
 * (and embedders) can pipe arbitrary streams through it. Responses are
 * written strictly in request order even though tool handlers are async.
 */
export function serveMCP(
  host: MCPServerHost,
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const lines = createInterface({ input: stdin, crlfDelay: Infinity });

  const write = (response: JSONRPCResponse): void => {
    stdout.write(JSON.stringify(response) + '\n');
  };

  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }

    let request: JSONRPCRequest;
    try {
      request = JSON.parse(trimmed) as JSONRPCRequest;
    } catch {
      write({ jsonrpc: '2.0', error: { code: JSONRPC_PARSE_ERROR, message: 'parse error' } });
      return;
    }

    const response = await handleMCPRequest(host, request);
    if (response) {
      write(response);
    }
  };

  return new Promise((resolve, reject) => {
    // Serialize handling so responses keep arriving in request order —
    // readline keeps emitting 'line' while an async handler is in flight.
    let queue: Promise<void> = Promise.resolve();
    lines.on('line', (line) => {
      queue = queue.then(() => handleLine(line));
    });
    lines.on('close', () => {
      queue.then(resolve, reject);
    });
  });
}

/**
 * Dispatches one JSON-RPC message. Returns undefined for notifications (no
 * id), which must not produce a response — including unknown notification
 * methods.
 */
async function handleMCPRequest(host: MCPServerHost, request: JSONRPCRequest): Promise<JSONRPCResponse | undefined> {
  const isNotification = request.id === undefined;

  switch (request.method) {
    case 'initialize':
      if (isNotification) return undefined;
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: MCP_SERVER_NAME,
            version: process.env.RATEGUARD_VERSION || 'dev',
          },
        },
      };

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return undefined;

    case 'ping':
      if (isNotification) return undefined;
      return { jsonrpc: '2.0', id: request.id, result: {} };

    case 'tools/list': {
      if (isNotification) return undefined;
      const tools = host.mcpTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
      return { jsonrpc: '2.0', id: request.id, result: { tools } };
    }

    case 'tools/call': {
      if (isNotification) return undefined;
      const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
      const name = typeof params.name === 'string' ? params.name : '';
      if (!name) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: JSONRPC_INVALID_PARAMS, message: 'tools/call requires params.name' },
        };
      }

      const args =
        params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      try {
        const result = await host.mcpCall(name, args);
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: { content: result.content, isError: false },
        };
      } catch (error) {
        // Tool-level failures are reported in-band per the MCP spec, not as
        // JSON-RPC protocol errors.
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: (error as Error).message }],
            isError: true,
          },
        };
      }
    }

    default:
      if (isNotification) {
        return undefined;
      }
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: JSONRPC_METHOD_NOT_FOUND, message: `method not found: ${request.method ?? ''}` },
      };
  }
}
