from __future__ import annotations

from typing import Awaitable, Callable

from ..runtime import RateGuardRuntime
from ..types import CompletionObservation, RequestContext, ResponseSnapshot, RateGuardOptions
from ._common import build_request_context, denial_asgi_headers, denial_body


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
        response_headers: dict[str, object] = {}

        async def wrapped_send(message: dict[str, object]) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = int(message.get("status", 200))
                raw_headers = message.get("headers")
                if isinstance(raw_headers, list):
                    for key, value in raw_headers:
                        if isinstance(key, (bytes, bytearray)):
                            response_headers[key.decode("latin-1")] = value.decode("latin-1") if isinstance(value, (bytes, bytearray)) else value
            elif message.get("type") == "http.response.body":
                body = message.get("body")
                if isinstance(body, (bytes, bytearray)):
                    body_parts.append(bytes(body))
            await send(message)

        await self.app(scope, receive, wrapped_send)
        snapshot = ResponseSnapshot(headers=response_headers, body=b"".join(body_parts).decode("utf-8", "ignore"), status_code=status_code)
        await self.guard.observe_async(request, CompletionObservation(status_code=status_code, snapshot=snapshot), started_at)

    async def _send_denied(self, send: ASGISend, status_code: int, retry_after_ms: int) -> None:
        headers = denial_asgi_headers(retry_after_ms)
        await send({"type": "http.response.start", "status": status_code, "headers": headers})
        await send({"type": "http.response.body", "body": denial_body(status_code, retry_after_ms), "more_body": False})

    def _build_request(self, scope: dict[str, object]) -> RequestContext:
        headers = self._headers(scope)
        path = str(scope.get("path") or "/")
        method = str(scope.get("method") or "GET").upper()
        return build_request_context(
            self.guard.config,
            method=method,
            path=path,
            headers=headers,
        )

    def _headers(self, scope: dict[str, object]) -> dict[str, object]:
        raw = scope.get("headers")
        headers: dict[str, object] = {}
        if isinstance(raw, list):
            for key, value in raw:
                if isinstance(key, (bytes, bytearray)):
                    headers[key.decode("latin-1")] = value.decode("latin-1") if isinstance(value, (bytes, bytearray)) else value
        return headers
