from __future__ import annotations

from rateguard import RateGuard
from rateguard.flask import RateGuardMiddleware
from rateguard.types import RateLimitOptions, TokenBudgetOptions
from rateguard.adapters.wsgi import ExcInfo, StartResponse, WSGIEnviron


def test_wsgi_middleware_returns_429_on_rate_limit() -> None:
    def app(environ: WSGIEnviron, start_response: StartResponse) -> list[bytes]:
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"ok"]

    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=1, burst=0, window_ms=60_000))
    middleware = RateGuardMiddleware(app, guard=guard.runtime)
    environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/hello"}
    statuses: list[str] = []

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> None:
        statuses.append(status)
        return None

    first = b"".join(middleware(environ, start_response))
    second = b"".join(middleware(environ, start_response))

    assert first == b"ok"
    assert statuses[0].startswith("200")
    assert statuses[1].startswith("429")
    assert second.startswith(b'{"error": "rate_limit_exceeded"')


def test_wsgi_middleware_does_not_extract_tokens_from_invalid_utf8_body() -> None:
    def app(environ: WSGIEnviron, start_response: StartResponse) -> list[bytes]:
        start_response("200 OK", [("Content-Type", "application/json")])
        return [b'{"usage":{"total_tokens":7}}\xff']

    guard = RateGuard(
        preset="dev",
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=100, mode="hard-stop"),
    )
    middleware = RateGuardMiddleware(app, guard=guard.runtime)
    environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/chat"}

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> None:
        return None

    body = b"".join(middleware(environ, start_response))

    assert body.endswith(b"\xff")
    assert guard.runtime.token_budget.usage("global:root:local:GET")["month"] == 0


def test_wsgi_middleware_reports_token_budget_error_code() -> None:
    def app(environ: WSGIEnviron, start_response: StartResponse) -> list[bytes]:
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"ok"]

    guard = RateGuard(
        preset="dev",
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=10, mode="hard-stop"),
    )
    guard.runtime.token_budget.record("global:root:local:GET", 10)
    middleware = RateGuardMiddleware(app, guard=guard.runtime)
    environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/chat"}

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> None:
        return None

    body = b"".join(middleware(environ, start_response))

    assert body.startswith(b'{"error": "token_budget_exceeded"')
