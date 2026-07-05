from __future__ import annotations

from rateguard import RateLimiter
from rateguard.types import RateLimitOptions

from .helpers import FixedClock


def test_increment_by_one_matches_allow() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=10, burst=3)

    allowed = limiter.allow("k-allow", options)
    incremented = limiter.increment("k-inc", options, 1.0)

    assert incremented.allowed == allowed.allowed
    assert incremented.remaining == allowed.remaining


def test_increment_by_n_consumes_atomically() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=10, burst=5)
    key = "k"

    first = limiter.increment(key, options, 3.0)
    assert first.allowed is True
    assert first.remaining == 2

    second = limiter.increment(key, options, 3.0)
    assert second.allowed is False

    third = limiter.increment(key, options, 2.0)
    assert third.allowed is True
    assert third.remaining == 0


def test_get_never_consumes() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=10, burst=4)
    key = "k"

    before = limiter.get(key, options)
    assert before.tokens == 4

    for _ in range(5):
        limiter.get(key, options)
    after = limiter.get(key, options)
    assert after.tokens == before.tokens

    limiter.increment(key, options, 1.0)
    after_consume = limiter.get(key, options)
    assert after_consume.tokens < before.tokens


def test_reset_refills_bucket() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=10, burst=2)
    key = "k"

    limiter.increment(key, options, 1.0)
    limiter.increment(key, options, 1.0)
    drained = limiter.increment(key, options, 1.0)
    assert drained.allowed is False

    limiter.reset(key)

    after_reset = limiter.increment(key, options, 1.0)
    assert after_reset.allowed is True
    assert after_reset.remaining == 1


def test_refills_over_time_exactly_like_allow() -> None:
    clock = FixedClock()
    limiter = RateLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=10, burst=5)
    key = "k"

    limiter.increment(key, options, 5.0)
    assert limiter.get(key, options).tokens == 0

    clock.advance(500)  # 0.5s * 10 rps = 5 tokens refilled
    assert limiter.get(key, options).tokens == 5.0
