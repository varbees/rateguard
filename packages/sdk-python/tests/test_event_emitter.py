from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from rateguard.config import resolve_rateguard_options
from rateguard.core.event_emitter import HTTPEventEmitter, build_event_envelope, create_event_emitter
from rateguard.types import RateGuardEventPayload, RateGuardOptions


def _sample_payload() -> RateGuardEventPayload:
    return RateGuardEventPayload(
        method="GET",
        path="/hello",
        status_code=200,
        latency_ms=5,
        rate_limit_applied=True,
        rate_limit_allowed=True,
        rate_limit_limit=10,
        rate_limit_remaining=9,
        preset="dev",
        circuit_breaker_state="closed",
    )


class _RecordingServer:
    """A tiny local HTTP server, run in a background thread, that records
    the last request it received."""

    def __init__(self, status_code: int = 200) -> None:
        self.received: dict[str, object] = {}
        recorder = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 - stdlib naming
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length)
                recorder.received["body"] = body
                recorder.received["content_type"] = self.headers.get("Content-Type")
                recorder.received["user_agent"] = self.headers.get("User-Agent")
                recorder.received["method"] = self.command
                self.send_response(status_code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b"{}")

            def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - stdlib signature
                pass

        self._server = HTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        port = self._server.server_address[1]
        return f"http://127.0.0.1:{port}/events"

    def __enter__(self) -> "_RecordingServer":
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._server.shutdown()
        self._thread.join(timeout=5)


@pytest.mark.asyncio
async def test_http_event_emitter_posts_expected_envelope_and_headers() -> None:
    with _RecordingServer(status_code=200) as server:
        emitter = HTTPEventEmitter(server.url)
        envelope = build_event_envelope(
            "request.completed",
            _sample_payload(),
            tenant_id="global",
            route_id="root",
            upstream_id="local",
            trace_id="trace-1",
        )
        await emitter.emit(envelope)

    assert server.received["method"] == "POST"
    assert server.received["content_type"] == "application/json"
    assert server.received["user_agent"] == "RateGuard-Python-SDK/0.1"
    parsed = json.loads(server.received["body"])  # type: ignore[arg-type]
    assert parsed["event_type"] == "request.completed"
    assert parsed["payload"]["path"] == "/hello"
    assert parsed["payload"]["status_code"] == 200
    assert parsed["trace_id"] == "trace-1"


@pytest.mark.asyncio
async def test_http_event_emitter_does_not_raise_on_error_status(caplog: pytest.LogCaptureFixture) -> None:
    with _RecordingServer(status_code=500) as server:
        emitter = HTTPEventEmitter(server.url)
        envelope = build_event_envelope("request.completed", _sample_payload(), tenant_id=None, route_id=None, upstream_id=None, trace_id=None)
        with caplog.at_level("WARNING"):
            await emitter.emit(envelope)  # must not raise

    assert "RateGuard event delivery failed" in caplog.text


@pytest.mark.asyncio
async def test_http_event_emitter_does_not_raise_when_unreachable(caplog: pytest.LogCaptureFixture) -> None:
    emitter = HTTPEventEmitter("http://127.0.0.1:1/unreachable", timeout=1.0)
    envelope = build_event_envelope("request.completed", _sample_payload(), tenant_id=None, route_id=None, upstream_id=None, trace_id=None)
    with caplog.at_level("WARNING"):
        await emitter.emit(envelope)  # must not raise

    assert "RateGuard event delivery failed" in caplog.text


@pytest.mark.asyncio
async def test_http_event_emitter_noop_when_endpoint_empty() -> None:
    emitter = HTTPEventEmitter("")
    envelope = build_event_envelope("request.completed", _sample_payload(), tenant_id=None, route_id=None, upstream_id=None, trace_id=None)
    await emitter.emit(envelope)  # must not raise, must not attempt a request


def test_create_event_emitter_prefers_event_endpoint_over_ws_url() -> None:
    options = resolve_rateguard_options(RateGuardOptions(event_endpoint="https://example.invalid/hook", ws_url="wss://example.invalid/ws"))
    emitter = create_event_emitter(options)
    assert isinstance(emitter, HTTPEventEmitter)


def test_create_event_emitter_prefers_explicit_emitter_over_event_endpoint() -> None:
    from rateguard.core.event_emitter import ConsoleEventEmitter

    console = ConsoleEventEmitter()
    options = resolve_rateguard_options(RateGuardOptions(event_endpoint="https://example.invalid/hook", event_emitter=console))
    emitter = create_event_emitter(options)
    assert emitter is console
