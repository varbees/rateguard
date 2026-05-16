from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from threading import RLock
from typing import Awaitable
import asyncio

from .bounded_cache import BoundedCache
from ..types import Clock, RateLimitDecision, RateLimitOptions


@dataclass(slots=True)
class _WindowState:
    timestamps: deque[float]


class RateLimiter:
    """In-process sliding-window rate limiter."""

    def __init__(self, clock: Clock, capacity: int = 50_000) -> None:
        self._clock = clock
        self._keys = BoundedCache[str, _WindowState](capacity)
        self._lock = RLock()
        self._async_lock = asyncio.Lock()

    def allow(self, key: str, options: RateLimitOptions, *, api_key: str | None = None) -> RateLimitDecision:
        with self._lock:
            return self._allow_locked(key, options)

    async def allow_async(self, key: str, options: RateLimitOptions, *, api_key: str | None = None) -> RateLimitDecision:
        async with self._async_lock:
            return self._allow_locked(key, options)

    def _allow_locked(self, key: str, options: RateLimitOptions) -> RateLimitDecision:
        now = self._clock.now()
        window_ms = options.window_ms if options.window_ms and options.window_ms > 0 else 1_000
        capacity = max(1, (options.requests_per_second or 0) + (options.burst or 0))
        state = self._keys.get_or_create(key, lambda: _WindowState(deque()))
        timestamps = state.timestamps
        cutoff = now - window_ms
        while timestamps and timestamps[0] <= cutoff:
            timestamps.popleft()
        if len(timestamps) >= capacity:
            oldest = timestamps[0] if timestamps else now
            retry_after_ms = max(1, int(oldest + window_ms - now))
            return RateLimitDecision(False, True, 0, retry_after_ms, capacity, False)
        timestamps.append(now)
        remaining = max(0, capacity - len(timestamps))
        return RateLimitDecision(True, True, remaining, 0, capacity, False)
