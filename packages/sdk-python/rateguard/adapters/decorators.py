from __future__ import annotations

from functools import wraps
from inspect import isawaitable, iscoroutinefunction
from typing import Any, Awaitable, Callable, ParamSpec, TypeVar

from ..config import preset_policy
from ..core.event_emitter import ConsoleEventEmitter
from ..core.rate_limiter import RateLimiter
from ..core.token_budget import TokenBudgetManager
from ..exceptions import RateGuardException

P = ParamSpec("P")
R = TypeVar("R")


def rate_limited(*, preset: str = "dev", requests_per_second: int | None = None, burst: int | None = None, window_ms: int = 1_000, key: str = "global") -> Callable[[Callable[P, R]], Callable[P, R]]:
    policy = preset_policy(preset)
    limiter = RateLimiter(clock=type("_Clock", (), {"now": staticmethod(lambda: __import__("time").time() * 1000.0)})(), capacity=50_000)
    rate_limit = type("_Opts", (), {"requests_per_second": requests_per_second or policy.requests_per_second, "burst": burst or policy.burst, "window_ms": window_ms})()

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        if iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args: P.args, **kwargs: P.kwargs):
                decision = await limiter.allow_async(key, rate_limit)
                if not decision.allowed:
                    raise RateGuardException("rate limit exceeded", status=429, retry_after=decision.retry_after_ms)
                return await func(*args, **kwargs)  # type: ignore[misc]

            return async_wrapper  # type: ignore[return-value]

        @wraps(func)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs):
            decision = limiter.allow(key, rate_limit)
            if not decision.allowed:
                raise RateGuardException("rate limit exceeded", status=429, retry_after=decision.retry_after_ms)
            return func(*args, **kwargs)

        return sync_wrapper

    return decorator


def token_budget(*, hard_stop: bool = True, monthly_limit: int = 0, soft_stop_at: float = 0.8, key: str = "global") -> Callable[[Callable[P, R]], Callable[P, R]]:
    manager = TokenBudgetManager(
        clock=type("_Clock", (), {"now": staticmethod(lambda: __import__("time").time() * 1000.0)})(),
        hour_limit=0,
        day_limit=0,
        month_limit=monthly_limit,
        mode="hard-stop" if hard_stop else "soft-stop",
        soft_stop_at=soft_stop_at,
        event_emitter=ConsoleEventEmitter(),
    )

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        if iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args: P.args, **kwargs: P.kwargs):
                decision = await manager.check_async(key)
                if not decision.allowed and hard_stop:
                    raise RateGuardException("token budget exceeded", status=429, retry_after=decision.retry_after_ms)
                result = await func(*args, **kwargs)  # type: ignore[misc]
                usage = getattr(result, "usage", None)
                if usage is not None:
                    total = getattr(usage, "total_tokens", 0)
                    if isinstance(total, int):
                        await manager.record_async(key, total)
                return result

            return async_wrapper  # type: ignore[return-value]

        @wraps(func)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs):
            decision = manager.check(key)
            if not decision.allowed and hard_stop:
                raise RateGuardException("token budget exceeded", status=429, retry_after=decision.retry_after_ms)
            result = func(*args, **kwargs)
            usage = getattr(result, "usage", None)
            total = getattr(usage, "total_tokens", 0) if usage is not None else 0
            if isinstance(total, int):
                manager.record(key, total)
            return result

        return sync_wrapper

    return decorator

