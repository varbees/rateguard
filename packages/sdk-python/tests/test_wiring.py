from __future__ import annotations

import json
from io import BytesIO

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient

from rateguard import RateGuard
from rateguard.adapters.asgi import ASGIMessage, ASGIReceive, ASGISend, RateGuardMiddleware as ASGIRateGuardMiddleware
from rateguard.adapters.wsgi import ExcInfo, RateGuardMiddleware as WSGIRateGuardMiddleware, StartResponse, WSGIEnviron
from rateguard.core.guardrails import standard_guardrails
from rateguard.types import CircuitBreakerOptions, CompletionObservation, RateLimitOptions, RequestContext, TokenBudgetOptions

from .helpers import FixedClock


# ── IETF RateLimit-* headers ──


@pytest.mark.asyncio
async def test_asgi_ietf_ratelimit_headers_present_on_allow_and_deny() -> None:
    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=1, burst=1, window_ms=60_000))
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
    assert first.headers["ratelimit-limit"] == "1"
    assert first.headers["ratelimit-remaining"] == "0"
    assert first.headers["ratelimit-reset"] == "0"

    assert second.status_code == 429
    assert second.headers["ratelimit-limit"] == "1"
    assert second.headers["ratelimit-remaining"] == "0"
    assert second.headers["ratelimit-reset"] == "1"
    # Same whole-second ceiling as Retry-After.
    assert second.headers["retry-after"] == second.headers["ratelimit-reset"]


@pytest.mark.asyncio
async def test_asgi_ietf_headers_absent_when_rate_limiter_not_applied() -> None:
    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=0, burst=0))
    app = FastAPI()
    app.add_middleware(guard.asgi_middleware)

    @app.get("/hello")
    async def hello() -> dict[str, bool]:
        return {"ok": True}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/hello")

    assert response.status_code == 200
    assert "ratelimit-limit" not in response.headers
    assert "ratelimit-remaining" not in response.headers
    assert "ratelimit-reset" not in response.headers


def test_wsgi_ietf_ratelimit_headers_present_on_allow_and_deny() -> None:
    def app(environ: WSGIEnviron, start_response: StartResponse) -> list[bytes]:
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"ok"]

    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=1, burst=1, window_ms=60_000))
    middleware = WSGIRateGuardMiddleware(app, guard=guard.runtime)
    environ: WSGIEnviron = {"REQUEST_METHOD": "GET", "PATH_INFO": "/hello"}
    captured: list[tuple[str, list[tuple[str, str]]]] = []

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> None:
        captured.append((status, headers))
        return None

    b"".join(middleware(environ, start_response))
    b"".join(middleware(environ, start_response))

    first_status, first_headers_list = captured[0]
    second_status, second_headers_list = captured[1]
    first_headers = dict(first_headers_list)
    second_headers = dict(second_headers_list)

    assert first_status.startswith("200")
    assert first_headers["RateLimit-Limit"] == "1"
    assert first_headers["RateLimit-Remaining"] == "0"
    assert first_headers["RateLimit-Reset"] == "0"

    assert second_status.startswith("429")
    assert second_headers["RateLimit-Limit"] == "1"
    assert second_headers["RateLimit-Remaining"] == "0"
    assert second_headers["RateLimit-Reset"] == "1"


# ── Loop detection wiring ──


@pytest.mark.asyncio
async def test_asgi_loop_detection_429s_on_repeated_fingerprint_at_higher_depth() -> None:
    guard = RateGuard(preset="dev", loop_detection=True, rate_limit=RateLimitOptions(requests_per_second=100, burst=100))
    app = FastAPI()
    calls = 0

    @app.post("/agent")
    async def agent() -> dict[str, bool]:
        nonlocal calls
        calls += 1
        return {"ok": True}

    app.add_middleware(guard.asgi_middleware)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/agent", headers={"X-Sequence-Depth": "1"}, content=b'{"a":1}')
        second = await client.post("/agent", headers={"X-Sequence-Depth": "2"}, content=b'{"a":1}')

    assert first.status_code == 200
    assert calls == 1

    assert second.status_code == 429
    assert calls == 1  # handler must NOT run for the rejected request
    body = second.json()
    assert body["error"] == "loop_detected"
    assert "loop detected" in body["message"]


@pytest.mark.asyncio
async def test_asgi_loop_detection_does_not_trigger_without_sequence_depth_header() -> None:
    guard = RateGuard(preset="dev", loop_detection=True, rate_limit=RateLimitOptions(requests_per_second=100, burst=100))
    app = FastAPI()

    @app.post("/agent")
    async def agent() -> dict[str, bool]:
        return {"ok": True}

    app.add_middleware(guard.asgi_middleware)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/agent", content=b'{"a":1}')
        second = await client.post("/agent", content=b'{"a":1}')

    assert first.status_code == 200
    assert second.status_code == 200


@pytest.mark.asyncio
async def test_asgi_loop_detection_disabled_by_default_even_with_header_present() -> None:
    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=100, burst=100))
    app = FastAPI()

    @app.post("/agent")
    async def agent() -> dict[str, bool]:
        return {"ok": True}

    app.add_middleware(guard.asgi_middleware)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/agent", headers={"X-Sequence-Depth": "1"}, content=b'{"a":1}')
        second = await client.post("/agent", headers={"X-Sequence-Depth": "99"}, content=b'{"a":1}')

    assert first.status_code == 200
    assert second.status_code == 200


def test_wsgi_loop_detection_429s_on_repeated_fingerprint_at_higher_depth() -> None:
    calls = 0

    def app(environ: WSGIEnviron, start_response: StartResponse) -> list[bytes]:
        nonlocal calls
        calls += 1
        start_response("200 OK", [("Content-Type", "application/json")])
        return [b"ok"]

    guard = RateGuard(preset="dev", loop_detection=True, rate_limit=RateLimitOptions(requests_per_second=100, burst=100))
    middleware = WSGIRateGuardMiddleware(app, guard=guard.runtime)

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> None:
        return None

    body = b'{"a":1}'
    first_environ: WSGIEnviron = {
        "REQUEST_METHOD": "POST",
        "PATH_INFO": "/agent",
        "CONTENT_LENGTH": str(len(body)),
        "HTTP_X_SEQUENCE_DEPTH": "1",
        "wsgi.input": BytesIO(body),
    }
    second_environ: WSGIEnviron = {
        "REQUEST_METHOD": "POST",
        "PATH_INFO": "/agent",
        "CONTENT_LENGTH": str(len(body)),
        "HTTP_X_SEQUENCE_DEPTH": "2",
        "wsgi.input": BytesIO(body),
    }

    first = b"".join(middleware(first_environ, start_response))
    assert calls == 1
    assert first == b"ok"

    second = b"".join(middleware(second_environ, start_response))
    assert calls == 1  # handler must NOT run for the rejected request
    parsed = json.loads(second)
    assert parsed["error"] == "loop_detected"


# ── Circuit breaker half-open probe leak (regression) ──


@pytest.mark.asyncio
async def test_circuit_breaker_does_not_wedge_when_half_open_probe_denied_by_guardrail() -> None:
    """Reproduces the exact production scenario: the breaker opens on
    upstream failures, the open timeout elapses, and the very first
    recovery request happens to trip a content guardrail before it ever
    reaches upstream. That request must NOT consume the breaker's probe
    permanently — a subsequent clean request has to get a real shot at
    testing upstream, not be wedged in half-open forever."""
    clock = FixedClock()
    guard = RateGuard(
        preset="dev",
        clock=clock,
        rate_limit=RateLimitOptions(requests_per_second=1_000, burst=1_000),
        token_budget=TokenBudgetOptions(hour_limit=1_000_000, day_limit=1_000_000, month_limit=1_000_000),
        guardrails=standard_guardrails(),
        circuit_breaker=CircuitBreakerOptions(
            error_rate_threshold=0.5,
            open_timeout_ms=60_000,
            half_open_successes_required=1,
            sample_size=1,
        ),
    )

    def request_context(request_id: str) -> RequestContext:
        return RequestContext(
            method="POST",
            path="/chat",
            headers={},
            request_id=request_id,
            trace_id=request_id,
            tenant_id="global",
            route_id="root",
            upstream_id="local",
        )

    upstream_calls = 0

    # Trip the breaker open with a clean request that fails upstream.
    tripped = request_context("trip")
    decision = await guard.runtime.admit_async(tripped, "summarize this document")
    assert decision.allowed is True
    upstream_calls += 1
    await guard.runtime.observe_async(
        tripped,
        CompletionObservation(status_code=500, token_budget_reservation_id=decision.token_budget_reservation_id),
        clock.now(),
    )

    clock.advance(61_000)

    # This request claims the half-open probe, then gets denied by the
    # guardrail before it ever reaches upstream — observe_async never runs.
    blocked = request_context("blocked")
    blocked_decision = await guard.runtime.admit_async(blocked, "email me at attacker@example.com")
    assert blocked_decision.allowed is False
    assert blocked_decision.status_code == 422

    # The bug: without releasing the probe, every request from here on
    # would see the breaker permanently wedged in half-open and never
    # reach upstream again, no matter how much time passes.
    recovered = request_context("recovered")
    recovered_decision = await guard.runtime.admit_async(recovered, "what is the weather today")
    assert recovered_decision.status_code != 503
    assert recovered_decision.allowed is True
    upstream_calls += 1
    await guard.runtime.observe_async(
        recovered,
        CompletionObservation(status_code=200, token_budget_reservation_id=recovered_decision.token_budget_reservation_id),
        clock.now(),
    )

    assert upstream_calls == 2


# ── Guardrails wiring ──


@pytest.mark.asyncio
async def test_asgi_guardrails_422s_violating_body_and_does_not_call_handler() -> None:
    guard = RateGuard(preset="dev", guardrails=standard_guardrails())
    app = FastAPI()
    calls = 0

    @app.post("/chat")
    async def chat() -> dict[str, bool]:
        nonlocal calls
        calls += 1
        return {"ok": True}

    app.add_middleware(guard.asgi_middleware)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/chat", content=b"contact me at attacker@example.com")

    assert response.status_code == 422
    assert calls == 0
    body = response.json()
    assert body["error"] == "pii_detected"

    stats = guard.guardrail_log.stats()
    assert stats["enabled"] is True
    assert stats["total"] == 1
    assert stats["by_code"]["pii_detected"] == 1
    assert stats["recent"][0]["code"] == "pii_detected"

    result = json.loads(guard.mcp_call("list_limits", {"key": "agent-1"}).content[0]["text"])
    assert result["guardrails"]["enabled"] is True
    assert result["guardrails"]["total"] == 1
    assert result["guardrails"]["by_code"]["pii_detected"] == 1


@pytest.mark.asyncio
async def test_asgi_guardrails_allows_clean_body_through_to_handler() -> None:
    guard = RateGuard(preset="dev", guardrails=standard_guardrails())
    app = FastAPI()
    calls = 0

    @app.post("/chat")
    async def chat() -> dict[str, bool]:
        nonlocal calls
        calls += 1
        return {"ok": True}

    app.add_middleware(guard.asgi_middleware)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/chat", content=b"what is the weather today")

    assert response.status_code == 200
    assert calls == 1


@pytest.mark.asyncio
async def test_asgi_guardrails_does_not_check_get_requests() -> None:
    guard = RateGuard(preset="dev", guardrails=standard_guardrails())
    app = FastAPI()
    calls = 0

    @app.get("/chat")
    async def chat() -> dict[str, bool]:
        nonlocal calls
        calls += 1
        return {"ok": True}

    app.add_middleware(guard.asgi_middleware)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/chat")

    assert response.status_code == 200
    assert calls == 1


@pytest.mark.asyncio
async def test_asgi_guardrails_forwards_full_body_to_downstream_app_when_clean() -> None:
    """Whitebox check that _BoundedBodyReader replays the exact original
    body to the wrapped ASGI app after RateGuard inspects it."""
    received: dict[str, bytes] = {}

    async def app(scope: object, receive: ASGIReceive, send: ASGISend) -> None:
        chunks: list[bytes] = []
        while True:
            message = await receive()
            body = message.get("body")
            chunks.append(bytes(body) if isinstance(body, (bytes, bytearray)) else b"")
            if not message.get("more_body", False):
                break
        received["body"] = b"".join(chunks)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok", "more_body": False})

    guard = RateGuard(preset="dev", guardrails=standard_guardrails())
    middleware = ASGIRateGuardMiddleware(app, guard.runtime)  # type: ignore[arg-type]

    body = b"what is the weather today"
    sent_once = False

    async def receive() -> ASGIMessage:
        nonlocal sent_once
        if not sent_once:
            sent_once = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: ASGIMessage) -> None:
        pass

    await middleware({"type": "http", "method": "POST", "path": "/chat", "headers": []}, receive, send)
    assert received["body"] == body


def test_wsgi_guardrails_422s_violating_body_and_does_not_call_handler() -> None:
    calls = 0

    def app(environ: WSGIEnviron, start_response: StartResponse) -> list[bytes]:
        nonlocal calls
        calls += 1
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"ok"]

    guard = RateGuard(preset="dev", guardrails=standard_guardrails())
    middleware = WSGIRateGuardMiddleware(app, guard=guard.runtime)

    body = b"my email is attacker@example.com"
    environ: WSGIEnviron = {
        "REQUEST_METHOD": "POST",
        "PATH_INFO": "/chat",
        "CONTENT_LENGTH": str(len(body)),
        "wsgi.input": BytesIO(body),
    }
    captured: list[str] = []

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> None:
        captured.append(status)
        return None

    result = b"".join(middleware(environ, start_response))
    assert calls == 0
    assert captured[0].startswith("422")
    parsed = json.loads(result)
    assert parsed["error"] == "pii_detected"


def test_wsgi_guardrails_allows_clean_body_and_forwards_full_body_downstream() -> None:
    received: dict[str, bytes] = {}

    def app(environ: WSGIEnviron, start_response: StartResponse) -> list[bytes]:
        stream = environ["wsgi.input"]
        received["body"] = stream.read()  # type: ignore[union-attr]
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"ok"]

    guard = RateGuard(preset="dev", guardrails=standard_guardrails())
    middleware = WSGIRateGuardMiddleware(app, guard=guard.runtime)

    body = b"what is the weather today"
    environ: WSGIEnviron = {
        "REQUEST_METHOD": "POST",
        "PATH_INFO": "/chat",
        "CONTENT_LENGTH": str(len(body)),
        "wsgi.input": BytesIO(body),
    }

    def start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> None:
        return None

    result = b"".join(middleware(environ, start_response))
    assert result == b"ok"
    assert received["body"] == body


def test_mcp_list_limits_guardrails_disabled_when_not_configured() -> None:
    rg = RateGuard(preset="dev")
    result = json.loads(rg.mcp_call("list_limits", {"key": "agent-1"}).content[0]["text"])
    assert result["guardrails"]["enabled"] is False


# ── rg.require (FastAPI Depends dependency) ──
#
# Regression coverage for a real bug found by a Fable 5 audit: require()
# was annotated `request: object`, so FastAPI's dependency resolver didn't
# recognize it as the special "inject the ASGI request" parameter and fell
# through to treating it as a required query parameter literally named
# "request" — every call 422'd. Nothing exercised rg.require through an
# actual FastAPI app before this (AGENTS.md rule 9's exact failure mode:
# exists, but unreachable in practice), which is exactly how it shipped
# broken in the README's own copy-pasteable example.


@pytest.mark.asyncio
async def test_require_dependency_allows_request_through() -> None:
    rg = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=100, burst=100))
    app = FastAPI()

    @app.post("/chat")
    async def chat(_: None = Depends(rg.require)) -> dict[str, bool]:
        return {"ok": True}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/chat")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


@pytest.mark.asyncio
async def test_require_dependency_raises_429_when_rate_limited() -> None:
    rg = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=1, burst=1))
    app = FastAPI()

    @app.post("/chat")
    async def chat(_: None = Depends(rg.require)) -> dict[str, bool]:
        return {"ok": True}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/chat")
        second = await client.post("/chat")

    assert first.status_code == 200
    assert second.status_code == 429


# ── Facade instance sharing (MCP tools must see the same state the real
# middleware admission path mutates, not a disconnected standalone copy) ──


def test_facade_loop_detector_is_shared_with_runtime() -> None:
    rg = RateGuard(preset="dev")
    assert rg.loop_detector is rg.runtime.loop_detector


def test_facade_guardrail_log_is_shared_with_runtime() -> None:
    rg = RateGuard(preset="dev")
    assert rg.guardrail_log is rg.runtime.guardrail_log


# ── Estimate-based budget reservations ──


def _request(key_suffix: str = "x") -> RequestContext:
    return RequestContext(
        method="GET",
        path=f"/{key_suffix}",
        headers={},
        request_id="r1",
        trace_id="t1",
        tenant_id="global",
        route_id="root",
        upstream_id="local",
    )


def test_estimated_tokens_per_request_lets_concurrent_same_key_requests_both_reserve() -> None:
    guard = RateGuard(
        preset="dev",
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=100, mode="hard-stop"),
        estimated_tokens_per_request=10,
    )
    request = _request()

    first = guard.runtime.admit(request)
    assert first.allowed is True
    assert first.token_budget is not None
    assert first.token_budget.remaining == 90

    second = guard.runtime.admit(request)
    assert second.allowed is True
    assert second.token_budget is not None
    assert second.token_budget.remaining == 80


def test_without_estimate_a_concurrent_same_key_request_is_serialized_old_behavior() -> None:
    guard = RateGuard(
        preset="dev",
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=100, mode="hard-stop"),
    )
    request = _request()

    first = guard.runtime.admit(request)
    assert first.allowed is True

    second = guard.runtime.admit(request)
    assert second.allowed is False
    assert second.error_code == "token_budget_exceeded"
