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

from ..types import BucketState, Clock, RateLimitDecision, RateLimitOptions
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
        return self._increment_token_bucket(key, rps, burst, 1.0)

    async def allow_async(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        return self.allow(key, options)

    def increment(self, key: str, options: RateLimitOptions, n: float) -> RateLimitDecision:
        """Consume n tokens atomically. increment(key, options, 1) behaves
        identically to allow(key, options). Used when a single call costs
        more than one unit of the limit — e.g. an LLM request billed by
        estimated token count rather than by call count.
        """
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        return self._increment_token_bucket(key, rps, burst, n)

    def get(self, key: str, options: RateLimitOptions) -> BucketState:
        """Return the current bucket state for key without consuming
        anything. Never creates bucket state for unseen keys."""
        rps = options.requests_per_second or 0
        burst = options.burst or 0

        with self._lock:
            bucket = self._buckets.get(key)

        if bucket is None:
            return BucketState(tokens=float(burst), capacity=burst, limit=rps)

        now = self._clock.now()
        tokens = bucket.tokens
        if now - bucket.last > 600_000:
            tokens = float(burst)
        else:
            elapsed = (now - bucket.last) / 1000.0
            if elapsed > 0:
                tokens = min(float(burst), tokens + elapsed * float(rps))

        return BucketState(tokens=tokens, capacity=burst, limit=rps)

    def reset(self, key: str) -> None:
        """Clear key's bucket; the next access starts from a full bucket."""
        with self._lock:
            self._buckets.delete(key)

    def peek(self, key: str, options: RateLimitOptions) -> RateLimitDecision:
        """Report what allow() would decide right now WITHOUT consuming a token.

        Pre-flight queries (MCP tools, dashboards) must use peek, never allow.
        Never creates bucket state for unseen keys.
        """
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        if rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now = self._clock.now()  # ms

        with self._lock:
            bucket = self._buckets.get(key)

        if bucket is None:
            return RateLimitDecision(True, True, burst, 0, rps, False)

        tokens = bucket.tokens
        if now - bucket.last > 600_000:
            tokens = float(burst)
        else:
            elapsed = (now - bucket.last) / 1000.0
            if elapsed > 0:
                tokens = min(float(burst), tokens + elapsed * float(rps))

        if tokens < 1.0:
            deficit = 1.0 - tokens
            retry_ms = max(1000, int(ceil(deficit / float(rps)) * 1000))
            return RateLimitDecision(False, True, 0, retry_ms, rps, False)

        return RateLimitDecision(True, True, max(0, int(tokens)), 0, rps, False)

    def _increment_token_bucket(
        self, key: str, rps: int, burst: int, n: float
    ) -> RateLimitDecision:
        """Consume n tokens atomically under the token bucket.

        Formula: tokens = min(burst, tokens + elapsed × rps)
        Allow: tokens >= n → consume n
        Deny: retry_after = ceil((n - tokens) / rps) × 1000 ms
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
        if bucket.tokens < n:
            deficit = n - bucket.tokens
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

        # Allow: consume n tokens
        bucket.tokens -= n
        return RateLimitDecision(
            allowed=True,
            applied=True,
            remaining=max(0, int(bucket.tokens)),
            retry_after_ms=0,
            limit=rps,
            degraded=False,
        )
