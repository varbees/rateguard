# RateGuard Python SDK

RateGuard is a middleware-first API protection and observability SDK for Python apps.

It runs entirely in-process by default:

- rate limiting
- token budgets
- circuit breaking
- request events

No Redis, Docker, dashboard, or control plane URL is required for standalone use. Add the control plane later only if you want realtime events and shared policy management.

## Install

```bash
pip install rateguard
```

## Quick Start

```python
from openai import AsyncOpenAI
from rateguard import BudgetExceeded, RateGuard

client = AsyncOpenAI()
rg = RateGuard(preset="standard")
budget = rg.budget


async def chat(user_id: str, messages: list):
    try:
        async with budget.enforce(user_id=user_id, hard_stop=True):
            stream = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                stream=True,
            )

            async for chunk in budget.track_stream(stream, user_id=user_id):
                yield chunk
    except BudgetExceeded as exc:
        print(exc)
        raise
```

For non-streaming calls, enforce before the request and record the returned token usage afterward:

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
| `preset` | `dev` / `standard` / `high-throughput` / `llm-heavy` / `strict-upstream-protection` | `dev` |
| `hard_stop` | `bool` | `True` |
| `monthly_limit` | `int` | preset-derived |
| `soft_stop_at` | `float` | `0.8` |

## Docs

- Go SDK: `packages/sdk-go`
- Node SDK: `packages/sdk-node`
