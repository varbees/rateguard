from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from rateguard import RateGuard
from rateguard.types import RateLimitOptions


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
