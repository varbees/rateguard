"""
Token-bucket rate limiter — same algorithm across all 3 RateGuard SDKs.

Algorithm: Token Bucket (RFC standards track, used by Kong, Envoy, AWS API Gateway)
- max_tokens = burst (bucket capacity)
- refill_rate = requests_per_second (tokens added per second)
- On each request: refill = elapsed_seconds × refill_rate, clamp to max_tokens
- Allow if tokens >= 1.0, consume 1 token
- Retry-after: time until bucket refills to 1.0 tokens

Source: https://en.wikipedia.org/wiki/Token_bucket
"""

from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from threading import RLock
from typing import TYPE_CHECKING

from ..types import Clock, RateLimitDecision, RateLimitOptions
from .bounded_cache import BoundedCache

if TYPE_CHECKING:
    pass


@dataclass(slots=True)
class _Bucket:
    tokens: float
    last: float  # ms timestamp


class RateLimiter:
    """In-process token-bucket rate limiter with bounded cache.

    All 3 RateGuard SDKs (Go, Node, Python) use the same token-bucket
    algorithm for deterministic, predictable behavior across languages.
    """

    def __init__(self, clock: Clock, capacity: int = 50_000) -> None:
        self._clock = clock
        self._buckets = BoundedCache[str, _Bucket](capacity)
        self._lock = RLock()

    def allow(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        return self._allow_token_bucket(key, rps, burst)

    async def allow_async(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        return self.allow(key, options)

    def _allow_token_bucket(self, key: str, rps: int, burst: int) -> RateLimitDecision:
        """Check if a request is allowed under the token bucket.

        Formula: tokens = min(burst, tokens + elapsed × rps)
        Allow: tokens >= 1.0 → consume 1
        Deny: retry_after = ceil((1.0 - tokens) / rps) × 1000 ms
        """
        if rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now = self._clock.now()  # ms

        with self._lock:
            bucket = self._buckets.get_or_create(
                key, lambda: _Bucket(tokens=float(burst), last=now)
            )

        # Idle bucket: reset after 10 minutes of inactivity
        if now - bucket.last > 600_000:  # 10 min in ms
            bucket.tokens = float(burst)
            bucket.last = now

        # Token bucket refill
        elapsed = (now - bucket.last) / 1000.0  # ms → seconds
        if elapsed > 0:
            bucket.tokens = min(float(burst), bucket.tokens + elapsed * float(rps))
            bucket.last = now

        # Deny if not enough tokens
        if bucket.tokens < 1.0:
            deficit = 1.0 - bucket.tokens
            retry_sec = ceil(deficit / float(rps))
            retry_ms = max(1000, int(retry_sec * 1000))
            return RateLimitDecision(
                allowed=False,
                applied=True,
                remaining=0,
                retry_after_ms=retry_ms,
                limit=rps,
                degraded=False,
            )

        # Allow: consume 1 token
        bucket.tokens -= 1.0
        return RateLimitDecision(
            allowed=True,
            applied=True,
            remaining=max(0, int(bucket.tokens)),
            retry_after_ms=0,
            limit=rps,
            degraded=False,
        )
