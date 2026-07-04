from __future__ import annotations

from typing import Awaitable, Callable

from ..runtime import RateGuardRuntime
from ..types import AdmissionErrorCode, CompletionObservation, HeaderValue, RequestContext, ResponseSnapshot, RateGuardOptions
from ._common import build_request_context, denial_asgi_headers, denial_body


ASGIHeader = tuple[bytes, bytes]
ASGIHeaders = list[ASGIHeader]
ASGIValue = str | int | bool | bytes | ASGIHeaders | None
ASGIMessage = dict[str, ASGIValue]
ASGIScope = dict[str, ASGIValue]
ASGIReceive = Callable[[], Awaitable[ASGIMessage]]
ASGISend = Callable[[ASGIMessage], Awaitable[None]]
ASGIApp = Callable[[ASGIScope, ASGIReceive, ASGISend], Awaitable[None]]


class RateGuardMiddleware:
    def __init__(self, app: ASGIApp, guard: RateGuardRuntime | RateGuardOptions) -> None:
        self.app = app
        self.guard = guard if isinstance(guard, RateGuardRuntime) else RateGuardRuntime(guard)

    async def __call__(self, scope: ASGIScope, receive: ASGIReceive, send: ASGISend) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        request = self._build_request(scope)
        started_at = self.guard.config.clock.now()
        preflight = await self.guard.admit_async(request)
        if not preflight.allowed:
            await self._send_denied(send, preflight.status_code or 429, preflight.retry_after_ms or 0, preflight.error_code)
            return

        status_code = 200
        body_parts: list[bytes] = []
        response_headers: dict[str, HeaderValue] = {}

        async def wrapped_send(message: ASGIMessage) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                raw_status = message.get("status")
                status_code = raw_status if isinstance(raw_status, int) else 200
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
        snapshot = ResponseSnapshot(headers=response_headers, body=b"".join(body_parts).decode("utf-8", "replace"), status_code=status_code)
        await self.guard.observe_async(
            request,
            CompletionObservation(
                status_code=status_code,
                snapshot=snapshot,
                token_budget_reservation_id=preflight.token_budget_reservation_id,
            ),
            started_at,
        )

    async def _send_denied(self, send: ASGISend, status_code: int, retry_after_ms: int, error_code: AdmissionErrorCode | None = None) -> None:
        headers = denial_asgi_headers(retry_after_ms)
        await send({"type": "http.response.start", "status": status_code, "headers": headers})
        await send({"type": "http.response.body", "body": denial_body(status_code, retry_after_ms, error_code), "more_body": False})

    def _build_request(self, scope: ASGIScope) -> RequestContext:
        headers = self._headers(scope)
        path = str(scope.get("path") or "/")
        method = str(scope.get("method") or "GET").upper()
        return build_request_context(
            self.guard.config,
            method=method,
            path=path,
            headers=headers,
        )

    def _headers(self, scope: ASGIScope) -> dict[str, HeaderValue]:
        raw = scope.get("headers")
        headers: dict[str, HeaderValue] = {}
        if isinstance(raw, list):
            for key, value in raw:
                if isinstance(key, (bytes, bytearray)):
                    headers[key.decode("latin-1")] = value.decode("latin-1") if isinstance(value, (bytes, bytearray)) else value
        return headers
