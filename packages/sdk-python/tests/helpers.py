from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class FixedClock:
    def __init__(self, start_ms: float = 0.0) -> None:
        self._now = start_ms

    def now(self) -> float:
        return self._now

    def advance(self, ms: float) -> None:
        self._now += ms


@dataclass(slots=True)
class RecordedEvent:
    event_type: str


class RecorderEmitter:
    def __init__(self) -> None:
        self.events: list[Any] = []

    async def emit(self, event: Any) -> None:
        self.events.append(event)


@dataclass(slots=True)
class Usage:
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(slots=True)
class Chunk:
    usage: Usage | None = None

