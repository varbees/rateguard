from __future__ import annotations

from rateguard import RateGuard
from rateguard.flask import RateGuardMiddleware
from rateguard.types import RateLimitOptions


def test_wsgi_middleware_returns_429_on_rate_limit() -> None:
    def app(environ: dict[str, object], start_response):  # type: ignore[no-untyped-def]
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"ok"]

    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=1, burst=0, window_ms=60_000))
    middleware = RateGuardMiddleware(app, guard=guard.runtime)
    environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/hello"}
    statuses: list[str] = []

    def start_response(status: str, headers: list[tuple[str, str]], exc_info=None):  # type: ignore[no-untyped-def]
        statuses.append(status)
        return None

    first = b"".join(middleware(environ, start_response))
    second = b"".join(middleware(environ, start_response))

    assert first == b"ok"
    assert statuses[0].startswith("200")
    assert statuses[1].startswith("429")
    assert second.startswith(b'{"error": "rate_limit_exceeded"')
