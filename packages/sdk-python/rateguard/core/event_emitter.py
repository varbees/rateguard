from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import datetime, timezone
from importlib import import_module
from json import dumps
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from ..config import derive_ws_url
from ..types import EventEmitterLike, RateGuardEvent, RateGuardEventPayload, RateGuardEventType, ResolvedRateGuardOptions

logger = logging.getLogger(__name__)

_HTTP_EVENT_EMITTER_USER_AGENT = "RateGuard-Python-SDK/0.1"
_HTTP_EVENT_EMITTER_TIMEOUT_SECONDS = 5.0


class ConsoleEventEmitter:
    async def emit(self, event: RateGuardEvent) -> None:
        print(dumps(asdict(event), separators=(",", ":")))


class HTTPEventEmitter:
    """POSTs the JSON-marshaled event envelope to a configured webhook
    endpoint. Mirrors Go's HTTPEventEmitter (events.go): same User-Agent,
    same Content-Type, same "status >= 300 is an error" rule, same
    5-second timeout. Event delivery must never break the request path,
    so failures are logged (not raised) — matching this file's existing
    fallback-on-failure pattern in WebSocketEventEmitter.

    Uses stdlib `urllib.request` only — no new hard dependency, matching
    this package's zero-core-deps precedent (see pyproject.toml
    `dependencies = []`) and Go's own zero-dependency-core ethos.
    """

    def __init__(self, endpoint: str, *, timeout: float = _HTTP_EVENT_EMITTER_TIMEOUT_SECONDS) -> None:
        self._endpoint = endpoint
        self._timeout = timeout

    async def emit(self, event: RateGuardEvent) -> None:
        if not self._endpoint:
            return
        # urllib is blocking; run it off-thread so it never blocks an
        # ASGI event loop. Sync call sites already bridge this async
        # `emit()` through runtime.py's `_emit_event_sync` (via
        # asyncio.run/ensure_future), so this is the only place that
        # needs to be async-safe.
        await asyncio.to_thread(self._post, event)

    def _post(self, event: RateGuardEvent) -> None:
        body = dumps(asdict(event), separators=(",", ":")).encode("utf-8")
        request = Request(
            self._endpoint,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "User-Agent": _HTTP_EVENT_EMITTER_USER_AGENT,
            },
        )
        try:
            with urlopen(request, timeout=self._timeout) as response:
                response.read()
                status = getattr(response, "status", None)
                if status is None:
                    status = response.getcode()
                if status >= 300:
                    logger.warning("RateGuard event delivery failed: HTTP %s", status)
        except HTTPError as exc:
            logger.warning("RateGuard event delivery failed: HTTP %s", exc.code)
        except (URLError, OSError, ValueError) as exc:
            logger.warning("RateGuard event delivery failed: %s", exc)


class WebSocketEventEmitter:
    def __init__(self, ws_url: str | None, fallback: EventEmitterLike | None = None) -> None:
        self._ws_url = ws_url
        self._fallback = fallback or ConsoleEventEmitter()

    async def emit(self, event: RateGuardEvent) -> None:
        if not self._ws_url:
            await self._fallback.emit(event)
            return
        try:
            connect = getattr(import_module("websockets"), "connect")
        except ImportError as exc:
            logger.warning("RateGuard websocket emitter unavailable; falling back to console: %s", exc)
            await self._fallback.emit(event)
            return
        try:
            async with connect(self._ws_url) as socket:
                await socket.send(dumps(asdict(event), separators=(",", ":")))
        except Exception as exc:
            logger.warning("RateGuard websocket delivery failed; falling back to console: %s", exc)
            await self._fallback.emit(event)


_DEFAULT_EVENT_QUEUE_SIZE = 1024


class AsyncEventEmitter:
    """Webhooks off the request hot path.

    HTTPEventEmitter's delivery is a network round-trip (up to its 5s
    timeout); awaited from the middleware, that puts the webhook inside
    every request. AsyncEventEmitter wraps any emitter with a bounded
    queue drained by one daemon worker thread, so the hot path pays O(1):
    an async ``emit()`` that enqueues and returns immediately. A thread
    (not an asyncio task) so the same wrapper serves both ASGI and
    WSGI/sync call sites.

    Semantics (mirrors Go's AsyncEventEmitter, events_async.go):
    - ``emit()`` never blocks and never raises. When the queue is full the
      incoming event is DROPPED and counted — telemetry must degrade,
      never the request path. Read ``dropped`` to alert on loss.
    - ``close(timeout)`` stops intake and waits for the drain; on timeout
      it returns False while the worker keeps draining in the background.
      Emitting after close counts as a drop.
    """

    def __init__(self, inner: EventEmitterLike, *, queue_size: int | None = None) -> None:
        import queue
        import threading

        self._inner = inner
        self._queue: "queue.Queue[RateGuardEvent | None]" = queue.Queue(
            maxsize=queue_size if queue_size and queue_size > 0 else _DEFAULT_EVENT_QUEUE_SIZE
        )
        self._dropped = 0
        self._closed = False
        self._lock = threading.Lock()
        self._worker = threading.Thread(target=self._run, name="rateguard-events", daemon=True)
        self._worker.start()

    @property
    def dropped(self) -> int:
        """Events discarded (queue full, or emitted after close)."""
        with self._lock:
            return self._dropped

    async def emit(self, event: RateGuardEvent) -> None:
        import queue

        with self._lock:
            if self._closed:
                self._dropped += 1
                return
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            with self._lock:
                self._dropped += 1

    def close(self, timeout: float = 5.0) -> bool:
        """Stop intake and wait for the queue to drain. Returns True when
        fully drained, False if timeout elapsed first (the worker keeps
        draining in the background). Safe to call more than once."""
        with self._lock:
            if not self._closed:
                self._closed = True
                # Sentinel wakes the worker for shutdown; use the blocking
                # put so the sentinel always lands even when the queue is
                # momentarily full.
                self._queue.put(None)
        self._worker.join(timeout)
        return not self._worker.is_alive()

    def _run(self) -> None:
        while True:
            event = self._queue.get()
            if event is None:
                return
            try:
                # The inner emit is async (HTTPEventEmitter awaits its
                # blocking post via a thread); one short-lived loop per
                # event keeps this worker paradigm-neutral. Delivery
                # failures are the inner emitter's story — it logs them.
                asyncio.run(self._inner.emit(event))
            except Exception:  # noqa: BLE001 — delivery must never kill the worker
                logger.warning("RateGuard async event delivery failed", exc_info=True)


def create_event_emitter(options: ResolvedRateGuardOptions) -> EventEmitterLike:
    if options.event_emitter is not None:
        return options.event_emitter
    if options.event_endpoint:
        # Wrapped async so webhook delivery never blocks the hot path; a
        # custom event_emitter is used exactly as given (wrap it in
        # AsyncEventEmitter yourself if you want the same behavior).
        return AsyncEventEmitter(HTTPEventEmitter(options.event_endpoint), queue_size=options.event_queue_size)
    ws_url = options.ws_url or derive_ws_url(options.control_plane_url)
    if ws_url:
        return WebSocketEventEmitter(ws_url)
    return ConsoleEventEmitter()


def build_event_envelope(
    event_type: RateGuardEventType,
    payload: RateGuardEventPayload,
    *,
    tenant_id: str | None,
    route_id: str | None,
    upstream_id: str | None,
    trace_id: str | None,
) -> RateGuardEvent:
    return RateGuardEvent(
        event_id=str(uuid4()),
        event_type=event_type,
        tenant_id=tenant_id,
        route_id=route_id,
        upstream_id=upstream_id,
        trace_id=trace_id,
        occurred_at=datetime.now(timezone.utc).isoformat(),
        payload=payload,
    )
