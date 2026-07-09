"""AsyncEventEmitter: webhooks off the request hot path — mirrors Go's
events_async_test.go and Node's event-emitter-async.test.ts."""

from __future__ import annotations

import threading
import time

from rateguard import AsyncEventEmitter, RateGuard
from rateguard.config import resolve_rateguard_options
from rateguard.core.event_emitter import build_event_envelope, create_event_emitter
from rateguard.types import RateGuardEvent, RateGuardEventPayload, RateGuardOptions


def envelope(event_id: str) -> RateGuardEvent:
    e = build_event_envelope(
        "request.completed",
        RateGuardEventPayload(method="GET", path="/x", status_code=200, latency_ms=1),
        tenant_id=None,
        route_id=None,
        upstream_id=None,
        trace_id=None,
    )
    return RateGuardEvent(
        event_id=event_id,
        event_type=e.event_type,
        tenant_id=e.tenant_id,
        route_id=e.route_id,
        upstream_id=e.upstream_id,
        trace_id=e.trace_id,
        occurred_at=e.occurred_at,
        payload=e.payload,
    )


class GatedEmitter:
    """Inner emitter whose deliveries block until released (credit-based,
    so releases issued before the worker reaches an event still count)."""

    def __init__(self) -> None:
        self.delivered: list[str] = []
        self._sem = threading.Semaphore(0)

    async def emit(self, event: RateGuardEvent) -> None:
        self._sem.acquire()
        self.delivered.append(event.event_id)

    def release(self, n: int = 1) -> None:
        for _ in range(n):
            self._sem.release()


class InstantEmitter:
    def __init__(self) -> None:
        self.delivered: list[str] = []

    async def emit(self, event: RateGuardEvent) -> None:
        self.delivered.append(event.event_id)


async def test_emit_returns_immediately_while_delivery_blocked() -> None:
    inner = GatedEmitter()
    e = AsyncEventEmitter(inner, queue_size=8)

    start = time.monotonic()
    await e.emit(envelope("a"))
    assert time.monotonic() - start < 0.5, "emit blocked on delivery"
    assert inner.delivered == []  # still gated

    inner.release(1)
    assert e.close(5.0) is True
    assert inner.delivered == ["a"]


async def test_delivers_in_order_and_drains_on_close() -> None:
    inner = InstantEmitter()
    e = AsyncEventEmitter(inner, queue_size=8)
    for i in range(5):
        await e.emit(envelope(str(i)))
    assert e.close(5.0) is True
    assert inner.delivered == ["0", "1", "2", "3", "4"]
    assert e.dropped == 0


async def test_drops_on_overflow_and_counts() -> None:
    inner = GatedEmitter()
    e = AsyncEventEmitter(inner, queue_size=2)

    deadline = time.monotonic() + 2.0
    for i in range(13):
        await e.emit(envelope(str(i)))
    assert time.monotonic() < deadline, "emit blocked — hot path violation"

    # 1 in flight + 2 queued accepted; the worker may not have taken the
    # first event off the queue yet, so allow 10 or 11 drops.
    assert e.dropped in (10, 11)

    inner.release(3)
    assert e.close(5.0) is True
    assert len(inner.delivered) + e.dropped == 13


async def test_close_times_out_honestly_and_keeps_draining() -> None:
    inner = GatedEmitter()
    e = AsyncEventEmitter(inner, queue_size=4)
    await e.emit(envelope("slow"))

    assert e.close(0.05) is False  # blocked → timeout

    inner.release(1)
    assert e.close(5.0) is True  # drain observed on second close
    assert inner.delivered == ["slow"]


async def test_emit_after_close_drops_without_raising() -> None:
    inner = InstantEmitter()
    e = AsyncEventEmitter(inner)
    assert e.close(1.0) is True
    await e.emit(envelope("late"))
    assert e.dropped == 1
    assert inner.delivered == []


async def test_inner_failures_never_kill_the_worker() -> None:
    class FailingEmitter:
        async def emit(self, event: RateGuardEvent) -> None:
            raise RuntimeError("endpoint down")

    e = AsyncEventEmitter(FailingEmitter())
    await e.emit(envelope("x"))
    await e.emit(envelope("y"))
    assert e.close(5.0) is True  # worker survived both failures


def test_event_endpoint_config_produces_async_wrapper() -> None:
    resolved = resolve_rateguard_options(RateGuardOptions(event_endpoint="http://127.0.0.1:9/events"))
    emitter = create_event_emitter(resolved)
    assert isinstance(emitter, AsyncEventEmitter)
    assert emitter.close(1.0) is True


def test_custom_emitter_used_exactly_as_given() -> None:
    custom = InstantEmitter()
    resolved = resolve_rateguard_options(RateGuardOptions(event_emitter=custom))
    assert create_event_emitter(resolved) is custom


def test_facade_shutdown_drains() -> None:
    # Port 9 (discard) is unreachable — delivery fails fast; shutdown must
    # still drain and return True.
    rg = RateGuard(event_endpoint="http://127.0.0.1:9/events")
    assert isinstance(rg.runtime.event_emitter, AsyncEventEmitter)
    assert rg.shutdown(5.0) is True
