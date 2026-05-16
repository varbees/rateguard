from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from rateguard import RateGuard
from rateguard.adapters.asgi import ASGIMessage, ASGIReceive, ASGIScope, ASGISend, RateGuardMiddleware
from rateguard.types import RateLimitOptions, TokenBudgetOptions


@pytest.mark.asyncio
async def test_fastapi_asgi_middleware_returns_429_on_rate_limit() -> None:
    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=1, burst=0, window_ms=60_000))
    app = FastAPI()
    app.add_middleware(guard.asgi_middleware)

    @app.get("/hello")
    async def hello() -> dict[str, bool]:
        return {"ok": True}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.get("/hello")
        second = await client.get("/hello")

    assert first.status_code == 200
    assert second.status_code == 429


@pytest.mark.asyncio
async def test_fastapi_asgi_middleware_records_token_headers() -> None:
    guard = RateGuard(
        preset="dev",
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=100, mode="hard-stop"),
    )
    app = FastAPI()
    app.add_middleware(guard.asgi_middleware)

    @app.get("/chat")
    async def chat() -> dict[str, bool]:
        from fastapi import Response

        response = Response(content='{"ok":true}', media_type="application/json")
        response.headers["x-rateguard-total-tokens"] = "7"
        return response

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/chat")

    assert response.status_code == 200
    assert guard.runtime.token_budget.usage("global:root:local:GET")["month"] == 7


@pytest.mark.asyncio
async def test_asgi_middleware_does_not_extract_tokens_from_invalid_utf8_body() -> None:
    async def app(scope: ASGIScope, receive: ASGIReceive, send: ASGISend) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": b'{"usage":{"total_tokens":7}}\xff', "more_body": False})

    guard = RateGuard(
        preset="dev",
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=100, mode="hard-stop"),
    )
    middleware = RateGuardMiddleware(app, guard.runtime)
    sent: list[ASGIMessage] = []

    async def receive() -> ASGIMessage:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: ASGIMessage) -> None:
        sent.append(message)

    await middleware({"type": "http", "method": "GET", "path": "/chat", "headers": []}, receive, send)

    assert sent[-1]["body"] == b'{"usage":{"total_tokens":7}}\xff'
    assert guard.runtime.token_budget.usage("global:root:local:GET")["month"] == 0
