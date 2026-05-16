from __future__ import annotations

from types import TracebackType
from typing import BinaryIO, Callable, Iterable, Protocol

from ..runtime import RateGuardRuntime
from ..types import AdmissionErrorCode, CompletionObservation, HeaderValue, RateGuardOptions, RequestContext, ResponseSnapshot
from ._common import build_request_context, denial_body, denial_headers


ExcInfo = tuple[type[BaseException], BaseException, TracebackType] | None


class StartResponse(Protocol):
    def __call__(self, status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> Callable[[bytes], None] | None: ...


WSGIEnvironValue = str | bytes | int | bool | BinaryIO | None
WSGIEnviron = dict[str, WSGIEnvironValue]
WSGIApp = Callable[[WSGIEnviron, StartResponse], Iterable[bytes]]


class RateGuardMiddleware:
    def __init__(self, app: WSGIApp, *, api_key: str | None = None, preset: str | None = None, guard: RateGuardRuntime | RateGuardOptions | None = None) -> None:
        self.app = app
        if isinstance(guard, RateGuardRuntime):
            self.guard = guard
        elif isinstance(guard, RateGuardOptions):
            self.guard = RateGuardRuntime(guard)
        else:
            self.guard = RateGuardRuntime(RateGuardOptions(api_key=api_key, preset=preset))

    def __call__(self, environ: WSGIEnviron, start_response: StartResponse) -> Iterable[bytes]:
        request = self._build_request(environ)
        started_at = self.guard.config.clock.now()
        preflight = self.guard.admit(request)
        if not preflight.allowed:
            return self._deny(start_response, preflight.status_code or 429, preflight.retry_after_ms or 0, preflight.error_code)

        captured_status = 200
        captured_headers: list[tuple[str, str]] = []

        def wrapped_start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> Callable[[bytes], None] | None:
            nonlocal captured_status, captured_headers
            captured_status = int(status.split(" ", 1)[0])
            captured_headers = headers
            return start_response(status, headers, exc_info)

        body = b"".join(self.app(environ, wrapped_start_response))
        snapshot = ResponseSnapshot(headers={k: v for k, v in captured_headers}, body=body.decode("utf-8", "replace"), status_code=captured_status)
        self.guard.observe(
            request,
            CompletionObservation(
                status_code=captured_status,
                snapshot=snapshot,
                token_budget_reservation_id=preflight.token_budget_reservation_id,
            ),
            started_at,
        )
        return [body]

    def _deny(self, start_response: StartResponse, status_code: int, retry_after_ms: int, error_code: AdmissionErrorCode | None = None) -> list[bytes]:
        start_response(f"{status_code} ERROR", denial_headers(retry_after_ms))
        return [denial_body(status_code, retry_after_ms, error_code)]

    def _build_request(self, environ: WSGIEnviron) -> RequestContext:
        path = str(environ.get("PATH_INFO") or "/")
        method = str(environ.get("REQUEST_METHOD") or "GET").upper()
        headers = self._headers(environ)
        return build_request_context(
            self.guard.config,
            method=method,
            path=path,
            headers=headers,
        )

    def _headers(self, environ: WSGIEnviron) -> dict[str, HeaderValue]:
        headers: dict[str, HeaderValue] = {}
        for key, value in environ.items():
            if key.startswith("HTTP_") and isinstance(value, str):
                header = key[5:].replace("_", "-").lower()
                headers[header] = value
        return headers
