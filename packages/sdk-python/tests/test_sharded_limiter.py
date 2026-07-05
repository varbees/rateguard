from __future__ import annotations

import random

from rateguard import RateLimiter, ShardedLimiter
from rateguard.types import RateLimitOptions

from .helpers import FixedClock


def test_sharded_limiter_allows_then_denies_within_window() -> None:
    clock = FixedClock()
    limiter = ShardedLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=1, burst=1, window_ms=1_000)

    first = limiter.allow("user:one", options)
    second = limiter.allow("user:one", options)

    assert first.allowed is True
    assert first.remaining == 0
    assert second.allowed is False
    assert second.retry_after_ms > 0


def test_sharded_limiter_disabled_policy_never_applies() -> None:
    clock = FixedClock()
    limiter = ShardedLimiter(clock, capacity=16)

    for options in (
        RateLimitOptions(requests_per_second=0, burst=10),
        RateLimitOptions(requests_per_second=10, burst=0),
    ):
        decision = limiter.allow("k", options)
        assert decision.allowed is True
        assert decision.applied is False
        assert decision.remaining == -1
        assert decision.limit == -1


def test_sharded_limiter_peek_never_consumes() -> None:
    clock = FixedClock()
    limiter = ShardedLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=5, burst=5)

    for _ in range(10):
        peeked = limiter.peek("peek-key", options)
        assert peeked.allowed is True
        assert peeked.remaining == 5

    # peek() on an unseen key never creates bucket state — get() after it
    # still reports a full, untouched bucket.
    state = limiter.get("peek-key", options)
    assert state.tokens == 5.0


def test_sharded_limiter_reset_restores_full_bucket() -> None:
    clock = FixedClock()
    limiter = ShardedLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=2, burst=2)

    limiter.allow("reset-key", options)
    limiter.allow("reset-key", options)
    denied = limiter.allow("reset-key", options)
    assert denied.allowed is False

    limiter.reset("reset-key")

    state = limiter.get("reset-key", options)
    assert state.tokens == 2.0
    allowed_again = limiter.allow("reset-key", options)
    assert allowed_again.allowed is True


def test_sharded_limiter_matches_rate_limiter_across_many_keys() -> None:
    """Decision parity, not performance parity (see sharded_limiter.py's
    module docstring): replay the identical randomized sequence of
    advance/key/n operations against both limiters and assert every single
    decision (allowed, remaining on allow, retry_after_ms on deny) is
    bit-for-bit identical."""
    rng = random.Random(20260706)

    clock_a = FixedClock()
    clock_b = FixedClock()
    rate_limiter = RateLimiter(clock_a, capacity=1_000)
    sharded_limiter = ShardedLimiter(clock_b, capacity=1_000)

    keys = [f"agent:{i}" for i in range(12)]
    options = RateLimitOptions(requests_per_second=10, burst=20)

    for step in range(2_000):
        # Occasional idle jump exercises the >600_000ms full-reset branch;
        # otherwise small forward jumps exercise ordinary partial refill.
        advance_ms = rng.choice([0, 0, 0, 50, 137, 900, 1_000, 5_000, 650_000])
        clock_a.advance(advance_ms)
        clock_b.advance(advance_ms)

        key = rng.choice(keys)
        n = float(rng.choice([1, 1, 1, 2, 5, 15, 25]))

        a = rate_limiter.increment(key, options, n)
        b = sharded_limiter.increment(key, options, n)

        assert a.allowed == b.allowed, f"step {step} key={key} n={n}"
        assert a.limit == b.limit, f"step {step} key={key} n={n}"
        if a.allowed:
            assert a.remaining == b.remaining, f"step {step} key={key} n={n}"
        else:
            assert a.retry_after_ms == b.retry_after_ms, f"step {step} key={key} n={n}"


async def test_sharded_limiter_allow_async_matches_allow() -> None:
    clock = FixedClock()
    limiter = ShardedLimiter(clock, capacity=16)
    options = RateLimitOptions(requests_per_second=3, burst=3)

    first = await limiter.allow_async("async-key", options)
    second = await limiter.allow_async("async-key", options)
    third = await limiter.allow_async("async-key", options)
    fourth = await limiter.allow_async("async-key", options)

    assert [d.allowed for d in (first, second, third, fourth)] == [True, True, True, False]
