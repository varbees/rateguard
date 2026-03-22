from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Awaitable, Callable, Protocol

from ..runtime import RateGuardRuntime
from ..types import CompletionObservation, RequestContext, ResponseSnapshot, RateGuardOptions
from ..core.utils import read_first_header


ASGIReceive = Callable[[], Awaitable[dict[str, object]]]
ASGISend = Callable[[dict[str, object]], Awaitable[None]]
ASGIApp = Callable[[dict[str, object], ASGIReceive, ASGISend], Awaitable[None]]


class RateGuardMiddleware:
    def __init__(self, app: ASGIApp, guard: RateGuardRuntime | RateGuardOptions) -> None:
        self.app = app
        self.guard = guard if isinstance(guard, RateGuardRuntime) else RateGuardRuntime(guard)

    async def __call__(self, scope: dict[str, object], receive: ASGIReceive, send: ASGISend) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        request = self._build_request(scope)
        started_at = self.guard.config.clock.now()
        preflight = await self.guard.admit_async(request)
        if not preflight.allowed:
            await self._send_denied(send, preflight.status_code or 429, preflight.retry_after_ms or 0)
            return

        status_code = 200
        body_parts: list[bytes] = []

        async def wrapped_send(message: dict[str, object]) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = int(message.get("status", 200))
            elif message.get("type") == "http.response.body":
                body = message.get("body")
                if isinstance(body, (bytes, bytearray)):
                    body_parts.append(bytes(body))
            await send(message)

        await self.app(scope, receive, wrapped_send)
        snapshot = ResponseSnapshot(headers={}, body=b"".join(body_parts).decode("utf-8", "ignore"), status_code=status_code)
        await self.guard.observe_async(request, CompletionObservation(status_code=status_code, snapshot=snapshot), started_at)

    async def _send_denied(self, send: ASGISend, status_code: int, retry_after_ms: int) -> None:
        headers: list[tuple[bytes, bytes]] = [(b"content-type", b"application/json")]
        if retry_after_ms > 0:
            headers.append((b"retry-after", str(max(1, (retry_after_ms + 999) // 1000)).encode()))
            headers.append((b"x-retry-after-ms", str(retry_after_ms).encode()))
        await send({"type": "http.response.start", "status": status_code, "headers": headers})
        await send({"type": "http.response.body", "body": json.dumps({"error": "rate_limit_exceeded" if status_code == 429 else "circuit_open", "retry_after_ms": retry_after_ms or None}).encode(), "more_body": False})

    def _build_request(self, scope: dict[str, object]) -> RequestContext:
        headers = self._headers(scope)
        path = str(scope.get("path") or "/")
        method = str(scope.get("method") or "GET").upper()
        request_id = read_first_header(headers, ["x-request-id"]) or path
        trace_id = read_first_header(headers, ["traceparent", "x-trace-id", "x-request-id"]) or request_id
        return RequestContext(
            method=method,
            path=path,
            headers=headers,
            request_id=request_id,
            trace_id=trace_id,
            tenant_id=self.guard.config.tenant_id,
            route_id=self.guard.config.route_id,
            upstream_id=self.guard.config.upstream_id,
            provider=self.guard.config.provider,
            model=self.guard.config.model,
        )

    def _headers(self, scope: dict[str, object]) -> dict[str, object]:
        raw = scope.get("headers")
        headers: dict[str, object] = {}
        if isinstance(raw, list):
            for key, value in raw:
                if isinstance(key, (bytes, bytearray)):
                    headers[key.decode("latin-1")] = value.decode("latin-1") if isinstance(value, (bytes, bytearray)) else value
        return headers
