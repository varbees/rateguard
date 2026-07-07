# RateGuard Python SDK

RateGuard is a middleware-first API protection and observability SDK for Python apps.

It runs entirely in-process by default:

- rate limiting
- token budgets
- circuit breaking
- request events

No external service is required for standalone use. Configure an event endpoint only when you want RateGuard events delivered outside the process.

## Install

```bash
pip install varbees-rateguard
```

## Quick Start

```python
from rateguard import BudgetExceeded, RateGuard

rg = RateGuard(preset="standard")
budget = rg.budget


async def call_provider(user_id: str) -> None:
    try:
        async with budget.enforce(user_id=user_id, hard_stop=True):
            # Call your LLM, API, worker, or provider here.
            pass

        budget.record(user_id=user_id, tokens=1200)
    except BudgetExceeded as exc:
        print(exc)
        raise
```

For provider SDKs that return token usage, enforce before the request and record the returned usage afterward:

```python
async with rg.budget.enforce(user_id="me", hard_stop=True):
    response = await client.chat.completions.create(model="gpt-4o", messages=messages)
    rg.budget.record(user_id="me", tokens=response.usage.total_tokens)
```

## FastAPI

Two ways to wire RateGuard in — pick one per route, not both, or a single
request gets admitted (and its rate limit/token budget consumed) twice.

Per-route, via `Depends` — needs the `fastapi` extra (`pip install
varbees-rateguard[fastapi]`):

```python
from fastapi import Depends, FastAPI
from rateguard import RateGuard

app = FastAPI()
rg = RateGuard(preset="standard")


@app.post("/chat")
async def chat(_=Depends(rg.require)):
    return {"ok": True}
```

App-wide, via ASGI middleware:

```python
from fastapi import FastAPI
from rateguard import RateGuard

app = FastAPI()
rg = RateGuard(preset="standard")
app.add_middleware(rg.asgi_middleware)


@app.post("/chat")
async def chat():
    return {"ok": True}
```

## Flask / WSGI

```python
from flask import Flask
from rateguard import RateGuard, RateGuardMiddleware

app = Flask(__name__)
rg = RateGuard(preset="standard")
app.wsgi_app = RateGuardMiddleware(app.wsgi_app, guard=rg.runtime)
```

## Configuration

| Key | Type | Default |
| --- | --- | --- |
| `preset` | `dev` / `standard` / `high-throughput` / `streaming-llm` / `agent-orchestrator` / `llm-heavy` / `mcp-server` / `strict-upstream-protection` | `dev` |
| `hard_stop` | `bool` | `True` |
| `monthly_limit` | `int` | preset-derived |
| `soft_stop_at` | `float` | `0.8` |

## Outbound LLM Tracking

Needs the `outbound` extra (`pip install varbees-rateguard[outbound]`) — `httpx` is a lazy, optional import.

```python
from openai import OpenAI, AsyncOpenAI
from rateguard import RateGuard

rg = RateGuard(preset="streaming-llm")
client = OpenAI(http_client=rg.wrap_httpx_client())
aclient = AsyncOpenAI(http_client=rg.wrap_httpx_async_client())
```

`rg.mcp_tools()` and `rg.mcp_call()` expose all 7 pre-flight MCP tools for agent frameworks (includes `attest_budget`/`verify_budget`). `serve_mcp(rg)` runs a zero-dependency stdio JSON-RPC server over the same tools — drop it straight into a Claude Code/Cursor/Claude Desktop MCP config. Guardrails, loop detection, GenAI attribute helpers (including TTFT/TPOT), and Prometheus exposition helpers are exported for app-level wiring.

## Also included

- **Budget attestation** (`pip install varbees-rateguard[attestation]`) — Ed25519-signed delegation chains (`new_root_budget_token`, `attest`, `verify_presentation`), byte-identical signing payload with Go and Node so a token attested in one language verifies in another. `cryptography` is a lazy, optional import — install the `attestation` extra to use it.
- **Redis distributed limiter** (`pip install varbees-rateguard[redis]`) — atomic Lua GCRA script for rate limits shared across processes/instances, `RedisPyClient`/`AsyncRedisPyClient` wrap `redis-py` or bring your own client shaped like `RedisLimiterClient`.
- **Admin API** — opt-in, unauthenticated-by-design ASGI app (`AdminApp`) exposing state/policy/MCP-tool-calls; bind privately.
- **Adaptive rate limiting** — opt-in AIMD controller that auto-tunes the effective limit from observed upstream error rate.
- **Semantic response caching** — bring your own `Embedder`; a cosine-similarity hit skips the network call, breaker, and budget entirely.
- **Lock-free sharded limiter** — 64-way sharding with atomic CAS, available as `ShardedLimiter`.
- **Events/webhooks** — `HTTPEventEmitter`/`WebSocketEventEmitter`/`ConsoleEventEmitter` for shipping admission decisions out of process.

## Docs

- Go SDK: `packages/sdk-go`
- Node SDK: `packages/sdk-node`
- Full feature parity as of v0.2.0 — see the [root README](https://github.com/varbees/rateguard#readme) for the complete capability table.
