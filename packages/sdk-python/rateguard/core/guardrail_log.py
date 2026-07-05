"""
Guardrail violation tracking — bounded ring buffer of recent violations plus
cumulative counts by code, mirroring Go's guardrail_log.go exactly.

Deliberately excludes the request body/content that triggered a violation —
the log exists for operator visibility, not to store the PII or injection
payload it just caught.
"""

from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from .guardrails import GuardrailViolation

_CAPACITY = 50


@dataclass(slots=True)
class GuardrailEvent:
    """A recorded violation: code, message, and when it happened."""

    code: str
    message: str
    at: str


class GuardrailLog:
    """Small bounded ring buffer of recent violations plus cumulative
    counts by code, guarded by a lock.

    Python is multi-threaded under WSGI (gunicorn sync workers can share a
    process with threads), so this mirrors Go's mutex-guarded guardrailLog
    even though violations are rare relative to the request hot path.
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self._recent: deque[GuardrailEvent] = deque(maxlen=_CAPACITY)
        self._counts: dict[str, int] = {}
        self._total = 0

    def record(self, violation: GuardrailViolation | None) -> None:
        if violation is None:
            return
        with self._lock:
            self._total += 1
            self._counts[violation.code] = self._counts.get(violation.code, 0) + 1
            self._recent.append(
                GuardrailEvent(code=violation.code, message=violation.message, at=datetime.now(timezone.utc).isoformat())
            )

    def stats(self) -> dict[str, Any]:
        """Mirrors Go's guardrailLog.Stats() shape convention — a plain
        dict ready to serialize into the MCP list_limits response. Callers
        that want "no guardrails configured at all" semantics should
        override the "enabled" key themselves (see mcp.py's list_limits) —
        this log always exists once a runtime is constructed, so "enabled"
        here reflects "the log is live," not "guardrails are configured."
        """
        with self._lock:
            return {
                "enabled": True,
                "total": self._total,
                "by_code": dict(self._counts),
                "recent": [asdict(event) for event in self._recent],
            }
