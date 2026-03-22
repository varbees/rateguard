from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
import asyncio

from ..types import CircuitBreakerDecision, CircuitBreakerOptions, CircuitBreakerState, Clock


@dataclass(slots=True)
class _OutcomeRing:
    values: list[bool]
    head: int = 0
    total: int = 0
    failures: int = 0


class CircuitBreaker:
    """Rolling-window circuit breaker with half-open probes."""

    def __init__(self, clock: Clock, options: CircuitBreakerOptions) -> None:
        self._clock = clock
        self._window_size = max(1, options.sample_size or 100)
        self._threshold = options.error_rate_threshold if options.error_rate_threshold is not None else 0.5
        self._open_timeout_ms = options.open_timeout_ms if options.open_timeout_ms is not None else 60_000
        self._half_open_successes_required = options.half_open_successes_required if options.half_open_successes_required is not None else 2
        self._min_samples_to_trip = min(10, self._window_size)
        self._state: CircuitBreakerState = "closed"
        self._opened_at_ms = 0.0
        self._probe_in_flight = False
        self._half_open_successes = 0
        self._ring = _OutcomeRing([False] * self._window_size)
        self._lock = RLock()
        self._async_lock = asyncio.Lock()

    def get_state(self) -> CircuitBreakerState:
        with self._lock:
            self._maybe_transition_to_half_open()
            return self._state

    async def get_state_async(self) -> CircuitBreakerState:
        async with self._async_lock:
            self._maybe_transition_to_half_open()
            return self._state

    def allow(self) -> CircuitBreakerDecision:
        with self._lock:
            return self._allow_locked()

    async def allow_async(self) -> CircuitBreakerDecision:
        async with self._async_lock:
            return self._allow_locked()

    def record_outcome(self, success: bool) -> CircuitBreakerDecision:
        with self._lock:
            self._push_outcome(not success)
            self._maybe_transition_to_half_open()
            if self._state == "half-open":
                if success:
                    self._half_open_successes += 1
                    self._probe_in_flight = False
                    if self._half_open_successes >= self._half_open_successes_required:
                        self._state = "closed"
                        self._half_open_successes = 0
                else:
                    self._open_locked()
            elif self._state == "closed":
                sample_count = max(1, self._ring.total)
                error_rate = self._ring.failures / sample_count
                if sample_count >= self._min_samples_to_trip and error_rate > self._threshold:
                    self._open_locked()
            return CircuitBreakerDecision(self._state != "open", self._state, self._open_timeout_ms if self._state == "open" else 0, self._probe_in_flight)

    def _allow_locked(self) -> CircuitBreakerDecision:
        self._maybe_transition_to_half_open()
        if self._state == "open":
            return CircuitBreakerDecision(False, "open", max(1, int(self._open_timeout_ms - (self._clock.now() - self._opened_at_ms))), False)
        if self._state == "half-open":
            if self._probe_in_flight:
                return CircuitBreakerDecision(False, "half-open", self._open_timeout_ms, True)
            self._probe_in_flight = True
            return CircuitBreakerDecision(True, "half-open", 0, True)
        return CircuitBreakerDecision(True, "closed", 0, False)

    def _maybe_transition_to_half_open(self) -> None:
        if self._state == "open" and self._clock.now() - self._opened_at_ms >= self._open_timeout_ms:
            self._state = "half-open"
            self._probe_in_flight = False
            self._half_open_successes = 0

    def _open_locked(self) -> None:
        self._state = "open"
        self._opened_at_ms = self._clock.now()
        self._probe_in_flight = False
        self._half_open_successes = 0

    def _push_outcome(self, failed: bool) -> None:
        outgoing = self._ring.values[self._ring.head]
        if self._ring.total >= self._window_size and outgoing:
            self._ring.failures -= 1
        self._ring.values[self._ring.head] = failed
        if failed:
            self._ring.failures += 1
        self._ring.head = (self._ring.head + 1) % self._window_size
        self._ring.total = min(self._ring.total + 1, self._window_size)
