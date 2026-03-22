from __future__ import annotations

import json
from io import BytesIO
from typing import Callable, Iterable, Protocol

from ..runtime import RateGuardRuntime
from ..types import CompletionObservation, RateGuardOptions, RequestContext, ResponseSnapshot
from ..core.utils import read_first_header


StartResponse = Callable[[str, list[tuple[str, str]]], Callable[[bytes], None] | None]
WSGIApp = Callable[[dict[str, object], StartResponse], Iterable[bytes]]


class RateGuardMiddleware:
    def __init__(self, app: WSGIApp, *, api_key: str | None = None, preset: str | None = None, guard: RateGuardRuntime | RateGuardOptions | None = None) -> None:
        self.app = app
        if isinstance(guard, RateGuardRuntime):
            self.guard = guard
        elif isinstance(guard, RateGuardOptions):
            self.guard = RateGuardRuntime(guard)
        else:
            self.guard = RateGuardRuntime(RateGuardOptions(api_key=api_key, preset=preset))

    def __call__(self, environ: dict[str, object], start_response: StartResponse) -> Iterable[bytes]:
        request = self._build_request(environ)
        started_at = self.guard.config.clock.now()
        preflight = self.guard.admit(request)
        if not preflight.allowed:
            return self._deny(start_response, preflight.status_code or 429, preflight.retry_after_ms or 0)

        captured_status = 200
        captured_headers: list[tuple[str, str]] = []

        def wrapped_start_response(status: str, headers: list[tuple[str, str]], exc_info=None):  # type: ignore[no-untyped-def]
            nonlocal captured_status, captured_headers
            captured_status = int(status.split(" ", 1)[0])
            captured_headers = headers
            return start_response(status, headers, exc_info)

        body = b"".join(self.app(environ, wrapped_start_response))
        snapshot = ResponseSnapshot(headers={k: v for k, v in captured_headers}, body=body.decode("utf-8", "ignore"), status_code=captured_status)
        self.guard.observe(request, CompletionObservation(status_code=captured_status, snapshot=snapshot), started_at)
        return [body]

    def _deny(self, start_response: StartResponse, status_code: int, retry_after_ms: int) -> list[bytes]:
        headers = [("Content-Type", "application/json")]
        if retry_after_ms > 0:
            headers.append(("Retry-After", str(max(1, (retry_after_ms + 999) // 1000))))
            headers.append(("X-Retry-After-Ms", str(retry_after_ms)))
        start_response(f"{status_code} ERROR", headers)
        return [json.dumps({"error": "rate_limit_exceeded" if status_code == 429 else "circuit_open", "retry_after_ms": retry_after_ms or None}).encode()]

    def _build_request(self, environ: dict[str, object]) -> RequestContext:
        path = str(environ.get("PATH_INFO") or "/")
        method = str(environ.get("REQUEST_METHOD") or "GET").upper()
        headers = self._headers(environ)
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

    def _headers(self, environ: dict[str, object]) -> dict[str, object]:
        headers: dict[str, object] = {}
        for key, value in environ.items():
            if key.startswith("HTTP_") and isinstance(value, str):
                header = key[5:].replace("_", "-").lower()
                headers[header] = value
        return headers
