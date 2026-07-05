from __future__ import annotations

from rateguard import AdaptiveLimiter, AdaptiveOptions, RateGuard, RateLimiter
from rateguard.types import RateLimitOptions

from .helpers import FixedClock


class _RecordingLimiter:
    """Stub inner limiter that just records the options it was called
    with, so tests can assert allow() and peek() see identically scaled
    policies without depending on token-bucket bucket state."""

    def __init__(self) -> None:
        self.allow_calls: list[RateLimitOptions] = []
        self.peek_calls: list[RateLimitOptions] = []

    def allow(self, key: str, options: RateLimitOptions, **kwargs: object):
        self.allow_calls.append(options)
        return _decision(options)

    async def allow_async(self, key: str, options: RateLimitOptions, **kwargs: object):
        return self.allow(key, options, **kwargs)

    def peek(self, key: str, options: RateLimitOptions):
        self.peek_calls.append(options)
        return _decision(options)


def _decision(options: RateLimitOptions):
    from rateguard.types import RateLimitDecision

    return RateLimitDecision(True, True, options.burst or 0, 0, options.requests_per_second or 0, False)


def test_adaptive_options_defaults_and_fallbacks() -> None:
    defaults = AdaptiveOptions().with_defaults()
    assert defaults.min_factor == 0.25
    assert defaults.max_factor == 2.0
    assert defaults.target_error_rate == 0.05
    assert defaults.increase_step == 0.05
    assert defaults.decrease_factor == 0.5
    assert defaults.adjust_interval_ms == 1_000
    assert defaults.ema_alpha == 0.2

    # Out-of-range/non-positive fields fall back to the same defaults —
    # mirrors Go's AdaptiveOptions.withDefaults().
    bad = AdaptiveOptions(
        min_factor=-1,
        max_factor=0,
        target_error_rate=0,
        increase_step=-5,
        decrease_factor=1.5,
        adjust_interval_ms=-100,
        ema_alpha=0,
    ).with_defaults()
    assert bad == defaults


def test_adaptive_limiter_starts_at_factor_one() -> None:
    clock = FixedClock()
    inner = RateLimiter(clock, capacity=16)
    adaptive = AdaptiveLimiter(inner, AdaptiveOptions(), clock)

    assert adaptive.factor() == 1.0
    assert adaptive.error_rate() == 0.0


def test_adaptive_limiter_shrinks_after_failures_and_grows_back_after_successes() -> None:
    clock = FixedClock()
    inner = RateLimiter(clock, capacity=16)
    opts = AdaptiveOptions(
        min_factor=0.25,
        max_factor=2.0,
        target_error_rate=0.05,
        increase_step=0.05,
        decrease_factor=0.5,
        adjust_interval_ms=1_000,
        ema_alpha=0.2,
    )
    adaptive = AdaptiveLimiter(inner, opts, clock)

    # A run of failures, one adjustment per interval, must only ever
    # shrink the factor (monotonic non-increase) and never breach the
    # configured floor.
    prev = adaptive.factor()
    for _ in range(10):
        clock.advance(opts.adjust_interval_ms)
        adaptive.record_outcome(False)
        current = adaptive.factor()
        assert current <= prev
        assert current >= opts.min_factor
        prev = current

    shrunk_factor = adaptive.factor()
    assert shrunk_factor == opts.min_factor  # clamped after enough failures
    assert adaptive.error_rate() > 0.8 * opts.target_error_rate

    # A run of successes afterward must grow the factor back up — never
    # above the configured ceiling.
    prev = adaptive.factor()
    grew_at_least_once = False
    for _ in range(60):
        clock.advance(opts.adjust_interval_ms)
        adaptive.record_outcome(True)
        current = adaptive.factor()
        assert current >= prev
        assert current <= opts.max_factor
        if current > prev:
            grew_at_least_once = True
        prev = current

    assert grew_at_least_once
    assert adaptive.factor() > shrunk_factor


def test_adaptive_limiter_does_not_adjust_within_the_interval() -> None:
    clock = FixedClock()
    inner = RateLimiter(clock, capacity=16)
    opts = AdaptiveOptions(adjust_interval_ms=1_000)
    adaptive = AdaptiveLimiter(inner, opts, clock)

    adaptive.record_outcome(False)  # first sample always adjusts
    factor_after_first = adaptive.factor()

    clock.advance(10)  # well within the 1s interval
    adaptive.record_outcome(False)
    assert adaptive.factor() == factor_after_first  # no second adjustment yet

    clock.advance(opts.adjust_interval_ms)
    adaptive.record_outcome(False)
    assert adaptive.factor() < factor_after_first  # interval elapsed, adjusts again


def test_adaptive_limiter_peek_scales_identically_to_allow() -> None:
    clock = FixedClock()
    recorder = _RecordingLimiter()
    adaptive = AdaptiveLimiter(recorder, AdaptiveOptions(decrease_factor=0.5, adjust_interval_ms=1), clock)

    # Force the factor away from 1.0 so scaling is actually exercised.
    adaptive.record_outcome(False)
    assert adaptive.factor() != 1.0

    options = RateLimitOptions(requests_per_second=100, burst=200)
    adaptive.allow("k", options)
    adaptive.peek("k", options)

    assert len(recorder.allow_calls) == 1
    assert len(recorder.peek_calls) == 1
    scaled_from_allow = recorder.allow_calls[0]
    scaled_from_peek = recorder.peek_calls[0]
    assert scaled_from_allow.requests_per_second == scaled_from_peek.requests_per_second
    assert scaled_from_allow.burst == scaled_from_peek.burst
    # Confirm it was actually scaled, not silently passed through unchanged.
    assert scaled_from_allow.requests_per_second != options.requests_per_second


def test_adaptive_limiter_passthrough_when_factor_is_one_or_policy_disabled() -> None:
    clock = FixedClock()
    recorder = _RecordingLimiter()
    adaptive = AdaptiveLimiter(recorder, AdaptiveOptions(), clock)

    options = RateLimitOptions(requests_per_second=100, burst=200)
    adaptive.allow("k", options)
    assert recorder.allow_calls[0] is options  # factor 1.0 -> unchanged object

    disabled = RateLimitOptions(requests_per_second=0, burst=200)
    adaptive.record_outcome(False)  # move factor away from 1.0
    adaptive.allow("k2", disabled)
    assert recorder.allow_calls[-1] is disabled  # rps<=0 -> never scaled


async def test_adaptive_limiter_allow_async_scales_like_allow() -> None:
    clock = FixedClock()
    recorder = _RecordingLimiter()
    adaptive = AdaptiveLimiter(recorder, AdaptiveOptions(decrease_factor=0.5, adjust_interval_ms=1), clock)
    adaptive.record_outcome(False)

    options = RateLimitOptions(requests_per_second=50, burst=50)
    await adaptive.allow_async("k", options)
    adaptive.peek("k", options)

    assert recorder.allow_calls[-1].requests_per_second == recorder.peek_calls[-1].requests_per_second


def test_rateguard_facade_wires_adaptive_rate_limit() -> None:
    rg = RateGuard(preset="dev", adaptive_rate_limit=True)
    assert rg.adaptive_limiter is not None
    assert rg.runtime.rate_limiter is rg.adaptive_limiter
    assert rg.adaptive_limiter.factor() == 1.0


def test_rateguard_facade_adaptive_disabled_by_default() -> None:
    rg = RateGuard(preset="dev")
    assert rg.adaptive_limiter is None
    assert isinstance(rg.runtime.rate_limiter, RateLimiter)
