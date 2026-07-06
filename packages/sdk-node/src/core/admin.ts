/**
 * Admin HTTP API — read/write control plane for dashboards and operator
 * tooling. Node port of Go's admin.go (packages/sdk-go).
 *
 *   GET   /admin/state?key=<key>   full snapshot for key — rate limit,
 *                                   token budget, circuit breaker, loop
 *                                   detector stats (same data as the
 *                                   list_limits MCP tool)
 *   GET   /admin/policy             current effective policy
 *   PATCH /admin/policy             partial policy override, applied via
 *                                   setPolicy — in-memory only, does not
 *                                   persist across restarts
 *   GET   /admin/mcp/tools          the MCP tool catalog (name, description,
 *                                   JSON Schema) — no handler funcs, safe to
 *                                   serialize
 *   POST  /admin/mcp/call           {"tool": "...", "args": {...}} — invokes
 *                                   the named MCP tool directly (same
 *                                   handler mcpCall dispatches to) and
 *                                   returns its result unwrapped, for a UI
 *                                   to render directly instead of parsing
 *                                   MCP's text-envelope transport shape
 *
 * Security posture: this handler has NO authentication and is not safe to
 * expose on the public internet — anyone who can reach it can read your
 * current limits and change them. Bind it to localhost, an internal
 * network, or put it behind your own reverse-proxy auth, the same posture
 * you'd give pprof or an unauthenticated Prometheus /metrics endpoint. It
 * is opt-in: nothing wires it into the middleware adapters.
 *
 * Zero new dependency: implemented against node:http's request/response
 * types — pass the returned handler to http.createServer(...), matching
 * Go's AdminHandler() http.Handler ergonomics.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { MCPTool } from './mcp.js';
import type { PolicyPreset, PolicyUpdate } from '../types.js';

/**
 * The slice of the RateGuard facade the admin API needs — structural so it
 * can be driven by the RateGuard class or anything shaped like it, and
 * shares that instance's limiter/budget/breaker state.
 */
export interface AdminHost {
  mcpTools(): MCPTool[];
  policy(): PolicyPreset;
  setPolicy(update: PolicyUpdate): PolicyPreset;
}

/**
 * Builds the admin request handler. Route it yourself or serve it whole:
 *
 *   import { createServer } from 'node:http';
 *   const guard = new RateGuard({ preset: 'standard' });
 *   createServer(createAdminHandler(guard)).listen(9090, '127.0.0.1');
 */
export function createAdminHandler(guard: AdminHost): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // CORS allows a dashboard running on a different port (the common
    // local-dev/self-host shape: app on :8080, dashboard on :3001). Scoped
    // to this handler only — never applied to the rate-limited request path.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://rateguard.admin');
    void route(guard, req, res, url).catch((error: unknown) => {
      writeAdminError(res, 500, (error as Error).message);
    });
  };
}

async function route(guard: AdminHost, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  switch (url.pathname) {
    case '/admin/state':
      return handleAdminState(guard, req, res, url);
    case '/admin/policy':
      return handleAdminPolicy(guard, req, res);
    case '/admin/mcp/tools':
      return handleAdminMCPTools(guard, req, res);
    case '/admin/mcp/call':
      return handleAdminMCPCall(guard, req, res);
    default:
      writeAdminError(res, 404, 'not found');
  }
}

async function handleAdminState(guard: AdminHost, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (req.method !== 'GET') {
    writeAdminError(res, 405, 'GET only');
    return;
  }

  const key = url.searchParams.get('key') || 'default';

  // Calls the same handler behind the list_limits MCP tool directly — it
  // already returns a plain object, so there's no need to round-trip
  // through mcpCall's JSON-in-a-string wrapping meant for MCP transport.
  const listLimits = guard.mcpTools().find((tool) => tool.name === 'list_limits');
  if (!listLimits) {
    writeAdminError(res, 500, 'list_limits tool unavailable');
    return;
  }

  try {
    const result = await listLimits.handler({ key });
    writeAdminJSON(res, 200, result);
  } catch (error) {
    writeAdminError(res, 500, (error as Error).message);
  }
}

/**
 * Wire shape for PATCH /admin/policy: every field is optional, matching
 * setPolicy's partial-override semantics. Snake_case keys mirror Go's
 * adminPolicyPatch.
 */
interface AdminPolicyPatch {
  requests_per_second?: unknown;
  burst?: unknown;
  token_budget_per_hour?: unknown;
  token_budget_per_day?: unknown;
  token_budget_per_month?: unknown;
  token_budget_mode?: unknown;
}

async function handleAdminPolicy(guard: AdminHost, req: IncomingMessage, res: ServerResponse): Promise<void> {
  switch (req.method) {
    case 'GET':
      writeAdminJSON(res, 200, guard.policy());
      return;
    case 'PATCH': {
      let patch: AdminPolicyPatch;
      try {
        patch = JSON.parse(await readBody(req)) as AdminPolicyPatch;
      } catch (error) {
        writeAdminError(res, 400, 'invalid JSON body: ' + (error as Error).message);
        return;
      }
      const update: PolicyUpdate = {};
      const rps = numberOrUndefined(patch.requests_per_second);
      if (rps !== undefined) update.requestsPerSecond = rps;
      const burst = numberOrUndefined(patch.burst);
      if (burst !== undefined) update.burst = burst;
      const perHour = numberOrUndefined(patch.token_budget_per_hour);
      if (perHour !== undefined) update.tokenBudgetPerHour = perHour;
      const perDay = numberOrUndefined(patch.token_budget_per_day);
      if (perDay !== undefined) update.tokenBudgetPerDay = perDay;
      const perMonth = numberOrUndefined(patch.token_budget_per_month);
      if (perMonth !== undefined) update.tokenBudgetPerMonth = perMonth;
      if (typeof patch.token_budget_mode === 'string') update.tokenBudgetMode = patch.token_budget_mode;
      writeAdminJSON(res, 200, guard.setPolicy(update));
      return;
    }
    default:
      writeAdminError(res, 405, 'GET or PATCH only');
  }
}

async function handleAdminMCPTools(guard: AdminHost, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    writeAdminError(res, 405, 'GET only');
    return;
  }

  // MCPTool minus its handler function — safe to serialize.
  const tools = guard.mcpTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
  writeAdminJSON(res, 200, tools);
}

async function handleAdminMCPCall(guard: AdminHost, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    writeAdminError(res, 405, 'POST only');
    return;
  }

  let call: { tool?: unknown; args?: unknown };
  try {
    call = JSON.parse(await readBody(req)) as { tool?: unknown; args?: unknown };
  } catch (error) {
    writeAdminError(res, 400, 'invalid JSON body: ' + (error as Error).message);
    return;
  }
  const toolName = typeof call.tool === 'string' ? call.tool : '';
  if (!toolName) {
    writeAdminError(res, 400, '"tool" is required');
    return;
  }

  const tool = guard.mcpTools().find((candidate) => candidate.name === toolName);
  if (!tool) {
    writeAdminError(res, 404, `unknown tool "${toolName}"`);
    return;
  }

  const args =
    call.args && typeof call.args === 'object' && !Array.isArray(call.args)
      ? (call.args as Record<string, unknown>)
      : {};
  try {
    const result = await tool.handler(args);
    writeAdminJSON(res, 200, result);
  } catch (error) {
    writeAdminError(res, 400, (error as Error).message);
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function writeAdminJSON(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function writeAdminError(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  writeAdminJSON(res, status, { error: message });
}
