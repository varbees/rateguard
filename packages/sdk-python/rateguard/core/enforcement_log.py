"""Enforcement audit trail.

An EnforcementEvent records RateGuard intervening on an outbound call: a budget
it stopped, a rate limit it hit, a freeze it enforced. The pull-side audit trail
behind "where did the spend go, and when did enforcement fire" — queryable
in-process (RateGuard.enforcement_events) and over the admin API
(GET /admin/events), never requiring a webhook. Mirrors Go's EnforcementEvent.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..types import Clock


@dataclass(slots=True)
class EnforcementEvent:
    at: str  # ISO-8601 timestamp
    type: str  # token_budget_exceeded, rate_limited, frozen
    customer: str = ""
    provider: str = ""
    model: str = ""
    detail: str = ""


class EnforcementLog:
    """Bounded ring buffer of the most recent enforcement events. Fixed memory:
    the oldest is dropped once full, so a long-running process never grows it."""

    def __init__(self, clock: "Clock", capacity: int = 1000) -> None:
        self._clock = clock
        self._events: deque[EnforcementEvent] = deque(maxlen=capacity)
        self._total = 0

    def record(
        self,
        event_type: str,
        *,
        customer: str = "",
        provider: str = "",
        model: str = "",
        detail: str = "",
    ) -> None:
        at = datetime.fromtimestamp(self._clock.now() / 1000, tz=timezone.utc).isoformat()
        self._events.append(
            EnforcementEvent(at=at, type=event_type, customer=customer, provider=provider, model=model, detail=detail)
        )
        self._total += 1

    def recent(self, limit: int = 0) -> list[EnforcementEvent]:
        """The most recent events, newest first. ``limit <= 0`` returns all."""
        events = list(reversed(self._events))
        return events[:limit] if limit > 0 else events

    def lifetime_total(self) -> int:
        return self._total
