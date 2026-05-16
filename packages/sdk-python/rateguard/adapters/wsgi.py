from __future__ import annotations

from typing import Callable, Iterable

from ..runtime import RateGuardRuntime
from ..types import CompletionObservation, RateGuardOptions, RequestContext, ResponseSnapshot
from ._common import build_request_context, denial_body, denial_headers


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
        start_response(f"{status_code} ERROR", denial_headers(retry_after_ms))
        return [denial_body(status_code, retry_after_ms)]

    def _build_request(self, environ: dict[str, object]) -> RequestContext:
        path = str(environ.get("PATH_INFO") or "/")
        method = str(environ.get("REQUEST_METHOD") or "GET").upper()
        headers = self._headers(environ)
        return build_request_context(
            self.guard.config,
            method=method,
            path=path,
            headers=headers,
        )

    def _headers(self, environ: dict[str, object]) -> dict[str, object]:
        headers: dict[str, object] = {}
        for key, value in environ.items():
            if key.startswith("HTTP_") and isinstance(value, str):
                header = key[5:].replace("_", "-").lower()
                headers[header] = value
        return headers
