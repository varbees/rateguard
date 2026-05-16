from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from json import dumps
import logging
from typing import Protocol
from uuid import uuid4

from ..config import derive_ws_url
from ..types import EventEmitterLike, RateGuardEvent, RateGuardEventPayload, RateGuardEventType, ResolvedRateGuardOptions

logger = logging.getLogger(__name__)


class ConsoleEventEmitter:
    async def emit(self, event: RateGuardEvent) -> None:
        print(dumps(asdict(event), separators=(",", ":")))


class WebSocketEventEmitter:
    def __init__(self, ws_url: str | None, fallback: EventEmitterLike | None = None) -> None:
        self._ws_url = ws_url
        self._fallback = fallback or ConsoleEventEmitter()

    async def emit(self, event: RateGuardEvent) -> None:
        if not self._ws_url:
            await self._fallback.emit(event)
            return
        try:
            import websockets  # type: ignore[import-not-found]
        except Exception as exc:
            logger.warning("RateGuard websocket emitter unavailable; falling back to console: %s", exc)
            await self._fallback.emit(event)
            return
        try:
            async with websockets.connect(self._ws_url) as socket:  # type: ignore[attr-defined]
                await socket.send(dumps(asdict(event), separators=(",", ":")))
        except Exception as exc:
            logger.warning("RateGuard websocket delivery failed; falling back to console: %s", exc)
            await self._fallback.emit(event)


def create_event_emitter(options: ResolvedRateGuardOptions) -> EventEmitterLike:
    if options.event_emitter is not None:
        return options.event_emitter
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
