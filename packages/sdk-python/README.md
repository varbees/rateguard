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

```python
from fastapi import Depends, FastAPI, Request
from rateguard import RateGuard

app = FastAPI()
rg = RateGuard(preset="standard")
app.add_middleware(rg.asgi_middleware)


@app.post("/chat")
async def chat(req: Request, _=Depends(rg.require)):
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

```python
from openai import OpenAI, AsyncOpenAI
from rateguard import RateGuard

rg = RateGuard(preset="streaming-llm")
client = OpenAI(http_client=rg.wrap_httpx_client())
aclient = AsyncOpenAI(http_client=rg.wrap_httpx_async_client())
```

`rg.mcp_tools()` and `rg.mcp_call()` expose the five pre-flight MCP tools for agent frameworks. Guardrails, loop detection, GenAI attribute helpers, and Prometheus exposition helpers are exported for app-level wiring.

## Docs

- Go SDK: `packages/sdk-go`
- Node SDK: `packages/sdk-node`
