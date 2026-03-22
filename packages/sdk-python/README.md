# RateGuard Python SDK

RateGuard is a middleware-first API protection and observability SDK for Python apps.

It gives you in-process:

- rate limiting
- token budgets
- circuit breaking
- request events

without requiring a control-plane runtime to be available.

## Install

```bash
pip install -e packages/sdk-python
```

## Quick Start

```python
from openai import AsyncOpenAI
from rateguard import RateGuard

client = AsyncOpenAI()
rg = RateGuard(api_key="...", preset="standard")
budget = rg.token_budget(
    hard_stop=True,
    monthly_limit=1_000_000,
    soft_stop_at=0.8,
)

async def chat(user_id: str, messages: list):
    async with budget.enforce(user_id):
        stream = await client.chat.completions.create(
            model="gpt-4o", messages=messages, stream=True
        )
        async for chunk in budget.track_stream(stream, user_id):
            yield chunk
```

## FastAPI

```python
from fastapi import Depends, FastAPI, Request
from rateguard import RateGuard

app = FastAPI()
rg = RateGuard(api_key="...", preset="standard")
app.add_middleware(rg.asgi_middleware)

@app.post("/chat")
async def chat(req: Request, _=Depends(rg.require)):
    return {"ok": True}
```

## Flask / WSGI

```python
from flask import Flask
from rateguard.flask import RateGuardMiddleware

app = Flask(__name__)
app.wsgi_app = RateGuardMiddleware(app.wsgi_app, api_key="...", preset="standard")
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
- Control plane: `apps/gateway`

