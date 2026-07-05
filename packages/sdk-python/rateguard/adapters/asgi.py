from __future__ import annotations

from typing import Awaitable, Callable

from ..runtime import MAX_INSPECTED_BODY_BYTES, RateGuardRuntime
from ..types import CompletionObservation, HeaderValue, PreflightDecision, RequestContext, ResponseSnapshot, RateGuardOptions
from ._common import admission_asgi_headers, build_request_context, denial_asgi_headers, resolve_denial_body


ASGIHeader = tuple[bytes, bytes]
ASGIHeaders = list[ASGIHeader]
ASGIValue = str | int | bool | bytes | ASGIHeaders | None
ASGIMessage = dict[str, ASGIValue]
ASGIScope = dict[str, ASGIValue]
ASGIReceive = Callable[[], Awaitable[ASGIMessage]]
ASGISend = Callable[[ASGIMessage], Awaitable[None]]
ASGIApp = Callable[[ASGIScope, ASGIReceive, ASGISend], Awaitable[None]]


class _BoundedBodyReader:
    """Wraps an ASGI `receive` callable so loop detection/guardrails can
    inspect at most `max_bytes` of the request body, while replaying the
    exact same bytes to the downstream app afterward — mirrors Go's
    io.LimitReader + io.MultiReader composition in sdk.go's
    checkRequestBody (the app must see the byte-identical body RateGuard
    inspected, even though RateGuard itself never buffers more than
    `max_bytes` from the wire).
    """

    def __init__(self, receive: ASGIReceive, max_bytes: int) -> None:
        self._receive = receive
        self._max_bytes = max_bytes
        self._replay_queue: list[bytes] = []
        self._replay_done = False
        self._extra_messages: list[ASGIMessage] = []

    async def read(self) -> bytes:
        buffered = bytearray()
        while len(buffered) < self._max_bytes:
            message = await self._receive()
            if message.get("type") != "http.request":
                self._extra_messages.append(message)
                self._replay_done = True
                break
            raw_chunk = message.get("body")
            chunk = bytes(raw_chunk) if isinstance(raw_chunk, (bytes, bytearray)) else b""
            more_body = bool(message.get("more_body", False))
            self._replay_queue.append(chunk)
            room = self._max_bytes - len(buffered)
            buffered.extend(chunk[:room])
            if not more_body:
                self._replay_done = True
                break
        return bytes(buffered[: self._max_bytes])

    async def __call__(self) -> ASGIMessage:
        if self._replay_queue:
            chunk = self._replay_queue.pop(0)
            more_body = bool(self._replay_queue) or not self._replay_done
            return {"type": "http.request", "body": chunk, "more_body": more_body}
        if self._extra_messages:
            return self._extra_messages.pop(0)
        if self._replay_done:
            return {"type": "http.request", "body": b"", "more_body": False}
        return await self._receive()


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

        effective_receive = receive
        body_text: str | None = None
        if self.guard.wants_request_body(request):
            reader = _BoundedBodyReader(receive, MAX_INSPECTED_BODY_BYTES)
            raw_body = await reader.read()
            body_text = raw_body.decode("utf-8", "replace")
            effective_receive = reader

        preflight = await self.guard.admit_async(request, body_text)
        if not preflight.allowed:
            await self._send_denied(send, preflight)
            return

        status_code = 200
        body_parts: list[bytes] = []
        response_headers: dict[str, HeaderValue] = {}
        extra_headers = admission_asgi_headers(preflight.rate_limit)

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
                    if extra_headers:
                        message = {**message, "headers": raw_headers + extra_headers}
            elif message.get("type") == "http.response.body":
                body = message.get("body")
                if isinstance(body, (bytes, bytearray)):
                    body_parts.append(bytes(body))
            await send(message)

        await self.app(scope, effective_receive, wrapped_send)
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

    async def _send_denied(self, send: ASGISend, preflight: PreflightDecision) -> None:
        status_code = preflight.status_code or 429
        retry_after_ms = preflight.retry_after_ms or 0
        headers = denial_asgi_headers(retry_after_ms) + admission_asgi_headers(preflight.rate_limit)
        await send({"type": "http.response.start", "status": status_code, "headers": headers})
        body = resolve_denial_body(preflight, status_code, retry_after_ms)
        await send({"type": "http.response.body", "body": body, "more_body": False})

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
