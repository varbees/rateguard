"""
Adaptive rate limiting — an AIMD (Additive-Increase/Multiplicative-Decrease)
controller wrapping any limiter, matching Go's adaptive.go exactly.

Static limits are provably suboptimal under shifting traffic (arXiv:2511.03279);
the fix does not need ML — an exponential moving average (EMA) of the upstream
error rate driving an AIMD controller (the same control shape TCP congestion
control uses) captures the result:

  - healthy upstream -> the effective limit grows additively toward
    max_factor x policy,
  - error rate at or above target -> the effective limit is cut
    multiplicatively toward min_factor x policy,
  - the cut triggers at 80% of the breach threshold, so load sheds
    *before* the circuit breaker has to trip (predictive, not reactive).

The configured policy is always the anchor: adaptation scales it, it never
replaces it. Peek scales identically to Allow, so agent pre-flight answers
stay honest while adaptation moves the limit.

Source (AIMD): https://en.wikipedia.org/wiki/Additive_increase/multiplicative_decrease
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from threading import Lock
from typing import TYPE_CHECKING, Protocol

from ..types import Clock, RateLimitDecision, RateLimitOptions

if TYPE_CHECKING:
    pass


class _ScalableLimiter(Protocol):
    """The subset of RateLimiter/ShardedLimiter's shape AdaptiveLimiter
    needs from whatever it wraps."""

    def allow(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision: ...

    async def allow_async(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision: ...

    def peek(self, key: str, options: RateLimitOptions) -> RateLimitDecision: ...


@dataclass(slots=True)
class AdaptiveOptions:
    """Tunes the adaptive rate limiting control loop. Non-positive (or
    otherwise out-of-range) fields fall back to the documented default —
    mirrors Go's AdaptiveOptions.withDefaults()."""

    # min_factor / max_factor bound how far the effective limit may drift
    # from the configured policy. The configured policy is always the
    # anchor — adaptation scales it, never replaces it.
    min_factor: float = 0.25
    max_factor: float = 2.0
    # target_error_rate is the upstream error rate the controller steers
    # under. Above it, limits shrink multiplicatively.
    target_error_rate: float = 0.05
    # increase_step is the additive factor gain per healthy interval.
    # decrease_factor is the multiplicative cut on breach. AIMD, the same
    # shape TCP congestion control uses.
    increase_step: float = 0.05
    decrease_factor: float = 0.5
    # adjust_interval_ms rate-limits controller decisions.
    adjust_interval_ms: int = 1_000
    # ema_alpha is the exponential moving average weight for new outcome
    # samples.
    ema_alpha: float = 0.2

    def with_defaults(self) -> "AdaptiveOptions":
        min_factor = self.min_factor if self.min_factor > 0 else 0.25
        max_factor = self.max_factor if self.max_factor > 0 else 2.0
        if max_factor < min_factor:
            max_factor = min_factor
        target_error_rate = self.target_error_rate if self.target_error_rate > 0 else 0.05
        increase_step = self.increase_step if self.increase_step > 0 else 0.05
        decrease_factor = self.decrease_factor if 0 < self.decrease_factor < 1 else 0.5
        adjust_interval_ms = self.adjust_interval_ms if self.adjust_interval_ms > 0 else 1_000
        ema_alpha = self.ema_alpha if 0 < self.ema_alpha <= 1 else 0.2
        return AdaptiveOptions(
            min_factor=min_factor,
            max_factor=max_factor,
            target_error_rate=target_error_rate,
            increase_step=increase_step,
            decrease_factor=decrease_factor,
            adjust_interval_ms=adjust_interval_ms,
            ema_alpha=ema_alpha,
        )


class AdaptiveLimiter:
    """Wraps any limiter (RateLimiter, ShardedLimiter, ...) and auto-tunes
    the effective policy from observed upstream outcomes instead of
    trusting a static config forever. See module docstring for the control
    loop shape.

    Implements the same allow/allow_async/peek shape RateLimiter and
    ShardedLimiter do, so it drops in wherever they're used (e.g.
    RateGuardRuntime.rate_limiter) — it does not additionally expose
    get/increment/reset: Go's AdaptiveLimiter only implements the Limiter
    interface (Allow/Peek), not the separate Store primitives, and this
    port keeps that same boundary.
    """

    def __init__(
        self,
        inner: "_ScalableLimiter",
        options: AdaptiveOptions | None = None,
        clock: Clock | None = None,
    ) -> None:
        self._inner = inner
        self._opts = (options or AdaptiveOptions()).with_defaults()
        self._clock = clock
        self._lock = Lock()
        self._factor = 1.0
        self._error_ema = 0.0
        self._sampled = False
        self._last_adjust: float | None = None

    def factor(self) -> float:
        """Reports the current policy scaling factor (1.0 = configured
        policy unchanged). Mirrors Go's AdaptiveLimiter.Factor()."""
        with self._lock:
            return self._factor

    def error_rate(self) -> float:
        """Reports the current EMA of upstream failures. Mirrors Go's
        AdaptiveLimiter.ErrorRate()."""
        with self._lock:
            return self._error_ema

    def record_outcome(self, success: bool) -> None:
        """Feeds one upstream result (success = HTTP status < 500) into
        the controller. The runtime calls this on the same signal it
        already feeds the circuit breaker."""
        now = self._clock.now() if self._clock is not None else 0.0
        sample = 0.0 if success else 1.0

        with self._lock:
            if not self._sampled:
                self._error_ema = sample
                self._sampled = True
            else:
                alpha = self._opts.ema_alpha
                self._error_ema = alpha * sample + (1 - alpha) * self._error_ema

            if self._last_adjust is not None and (now - self._last_adjust) < self._opts.adjust_interval_ms:
                return
            self._last_adjust = now

            # Predictive: act at 80% of the target so the circuit breaker
            # rarely has to trip.
            if self._error_ema >= 0.8 * self._opts.target_error_rate:
                self._factor = max(self._opts.min_factor, self._factor * self._opts.decrease_factor)
            else:
                self._factor = min(self._opts.max_factor, self._factor + self._opts.increase_step)

    def _scaled(self, options: RateLimitOptions) -> RateLimitOptions:
        with self._lock:
            factor = self._factor

        rps = options.requests_per_second or 0
        burst = options.burst or 0
        if factor == 1.0 or rps <= 0 or burst <= 0:
            return options

        scaled_rps = max(1, round(rps * factor))
        scaled_burst = max(1, round(burst * factor))
        return replace(options, requests_per_second=scaled_rps, burst=scaled_burst)

    def allow(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        return self._inner.allow(key, self._scaled(options), **kwargs)

    async def allow_async(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        return await self._inner.allow_async(key, self._scaled(options), **kwargs)

    def peek(self, key: str, options: RateLimitOptions) -> RateLimitDecision:
        """Scales identically to allow() so agent pre-flight answers stay
        honest while adaptation moves the limit."""
        return self._inner.peek(key, self._scaled(options))
