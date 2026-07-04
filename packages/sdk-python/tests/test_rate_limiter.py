from __future__ import annotations

from rateguard import RateLimiter
from rateguard.types import RateLimitOptions

from .helpers import FixedClock


def test_rate_limiter_allows_then_denies_within_window() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=1, burst=1, window_ms=1_000)

    first = limiter.allow("user:one", options)
    second = limiter.allow("user:one", options)

    assert first.allowed is True
    assert second.allowed is False
    assert second.retry_after_ms > 0

