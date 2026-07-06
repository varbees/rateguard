# RateGuard Node SDK

RateGuard's Node SDK is an in-process middleware package for Express, Fastify, Hono, and Next.js route handlers.

Standalone mode is the default:

- no control plane URL is required
- local rate limiting, token budgets, and circuit breaking work in-process
- realtime events fall back to local console output when no websocket endpoint is configured
- Express middleware sets the standard rate-limit headers on every response:
  - `X-RateGuard-Preset`
  - `X-RateGuard-Limit`
  - `X-RateGuard-Burst`
  - `X-RateGuard-Remaining`
  - `Retry-After` on 429 responses

## Install

```bash
npm install @varbees/rateguard-node
```

or

```bash
bun add @varbees/rateguard-node
```

## Quick Start

```ts
import { RateGuard } from '@varbees/rateguard-node';

const rg = new RateGuard({ preset: 'standard' });

app.use(rg.middleware());
```

For Next.js route handlers:

```ts
import { RateGuard } from '@varbees/rateguard-node';

const rg = new RateGuard({ preset: 'standard' });

export const POST = rg.withRateGuard(async (request) => {
  return Response.json({ ok: true });
});
```

Rate limiting:

- local mode uses an in-process token bucket per key
- an optional remote endpoint can delegate rate decisions elsewhere

Outbound LLM tracking:

```ts
import OpenAI from 'openai';
import { RateGuard } from '@varbees/rateguard-node';

const rg = new RateGuard({ preset: 'streaming-llm' });
const client = new OpenAI({ fetch: rg.wrapFetch() });
```

`rg.mcpTools()` and `rg.mcpCall()` expose all 7 pre-flight MCP tools for agent frameworks (includes `attestBudget`/`verifyBudget`). `serveMCP(rg)` runs a zero-dependency stdio JSON-RPC server over the same tools — drop it straight into a Claude Code/Cursor/Claude Desktop MCP config. Guardrails, loop detection, GenAI attribute helpers (including TTFT/TPOT), and Prometheus exposition helpers are exported for app-level wiring.

## Also included

- **Budget attestation** — Ed25519-signed delegation chains (`newRootBudgetToken`, `attest`, `verifyPresentation`), byte-identical signing payload with Go and Python so a token attested in one language verifies in another.
- **Redis distributed limiter** — atomic Lua GCRA script for rate limits shared across processes/instances, pass any client shaped like `RedisLimiterClient`.
- **Admin API** — opt-in, unauthenticated-by-design HTTP handler (`createAdminHandler`) exposing state/policy/MCP-tool-calls; bind privately.
- **Adaptive rate limiting** — opt-in AIMD controller that auto-tunes the effective limit from observed upstream error rate.
- **Semantic response caching** — bring your own `Embedder`; a cosine-similarity hit skips the network call, breaker, and budget entirely.
- **Lock-free sharded limiter** — 64-way sharding with atomic CAS, the default under `ShardedLimiter`.
- **Events/webhooks** — `HTTPEventEmitter`/`WebSocketEventEmitter`/`ConsoleEventEmitter` for shipping admission decisions out of process.

## Status

This package is the Node middleware counterpart to the Go and Python SDKs — full feature parity as of v0.2.0, see the [root README](https://github.com/varbees/rateguard#readme) for the complete capability table.
