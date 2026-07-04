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

`rg.mcpTools()` and `rg.mcpCall()` expose the five pre-flight MCP tools for agent frameworks. Guardrails, loop detection, GenAI attribute helpers, and Prometheus exposition helpers are exported for app-level wiring.

## Status

This package is the Node middleware counterpart to the Go and Python SDKs.
