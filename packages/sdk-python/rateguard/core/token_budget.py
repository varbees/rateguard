from __future__ import annotations

from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threading import RLock
import asyncio
from typing import AsyncIterable, AsyncIterator, Literal, Protocol, TypedDict

from .bounded_cache import BoundedCache
from .utils import extract_token_usage_from_headers, extract_token_usage_from_text
from ..exceptions import BudgetExceeded
from ..types import Clock, EventEmitterLike, ResponseSnapshot, TokenBudgetDecision, TokenBudgetOptions, TokenUsage


TokenBudgetWindow = Literal["hour", "day", "month", ""]


class _UsageSnapshot(TypedDict):
    hour: int
    day: int
    month: int
    max_usage: int
    retry_after_ms: int
    window: TokenBudgetWindow


class _ActiveWindow(TypedDict):
    window: TokenBudgetWindow
    used: int
    limit: int
    exceeded: bool


class _UsageCarrier(Protocol):
    usage: object | None


@dataclass(slots=True)
class _TokenBudgetRecord:
    at: float
    tokens: int


@dataclass(slots=True)
class _TokenBudgetState:
    records: deque[_TokenBudgetRecord]


class TokenBudgetManager:
    """Rolling-window token budget manager."""

    def __init__(
        self,
        *,
        clock: Clock,
        hour_limit: int,
        day_limit: int,
        month_limit: int,
        mode: str,
        soft_stop_at: float = 0.8,
        event_emitter: EventEmitterLike | None = None,
        capacity: int = 50_000,
    ) -> None:
        self._clock = clock
        self._limits = TokenBudgetOptions(hour_limit, day_limit, month_limit, mode, soft_stop_at)
        self._states = BoundedCache[str, _TokenBudgetState](capacity)
        self._lock = RLock()
        self._async_lock = asyncio.Lock()
        self._event_emitter = event_emitter

    @property
    def options(self) -> TokenBudgetOptions:
        return self._limits

    def check(self, key: str, options: TokenBudgetOptions | None = None) -> TokenBudgetDecision:
        with self._lock:
            return self._check_locked(key, options or self._limits)

    async def check_async(self, key: str, options: TokenBudgetOptions | None = None) -> TokenBudgetDecision:
        async with self._async_lock:
            return self._check_locked(key, options or self._limits)

    def record(self, key: str, tokens: int) -> None:
        if tokens <= 0:
            return
        with self._lock:
            self._record_locked(key, tokens)

    async def record_async(self, key: str, tokens: int) -> None:
        if tokens <= 0:
            return
        async with self._async_lock:
            self._record_locked(key, tokens)

    def usage(self, key: str, options: TokenBudgetOptions | None = None) -> dict[str, int | str]:
        with self._lock:
            return self._usage_locked(key, options or self._limits)

    def budget_exceeded(self, key: str, decision: TokenBudgetDecision, options: TokenBudgetOptions | None = None) -> BudgetExceeded:
        usage = self.usage(key, options)
        used = int(usage.get(decision.window or "month", usage.get("month", 0)) or 0)
        return BudgetExceeded.from_decision(
            used=used,
            limit=decision.limit,
            window=decision.window or "month",
            retry_after_ms=decision.retry_after_ms,
            retry_after_at_ms=self._clock.now() + max(0, decision.retry_after_ms),
        )

    def record_from_snapshot(self, key: str, snapshot: ResponseSnapshot) -> TokenUsage | None:
        usage = extract_token_usage_from_headers(snapshot.headers) or extract_token_usage_from_text(snapshot.body)
        if usage is None:
            return None
        self.record(key, usage.total_tokens)
        return usage

    @asynccontextmanager
    async def enforce(self, key: str) -> AsyncIterator[None]:
        decision = await self.check_async(key)
        if not decision.allowed:
            raise self.budget_exceeded(key, decision)
        yield

    async def track_stream(self, stream: AsyncIterable[object], key: str) -> AsyncIterator[object]:
        last_usage: TokenUsage | None = None
        async for chunk in stream:
            extracted = self._extract_usage_from_chunk(chunk)
            if extracted is not None:
                last_usage = extracted
            yield chunk
        if last_usage is not None:
            await self.record_async(key, last_usage.total_tokens)

    def _record_locked(self, key: str, tokens: int) -> None:
        state = self._states.get_or_create(key, lambda: _TokenBudgetState(deque()))
        state.records.append(_TokenBudgetRecord(self._clock.now(), tokens))

    def _check_locked(self, key: str, options: TokenBudgetOptions) -> TokenBudgetDecision:
        usage = self._usage_locked(key, options)
        active = self._active_window(usage["hour"], usage["day"], usage["month"], options)
        warning = options.mode == "soft-stop" and active["limit"] > 0 and active["used"] >= int(active["limit"] * (options.soft_stop_at or 0.8))
        if options.mode == "soft-stop":
            return TokenBudgetDecision(True, active["limit"] > 0, False, max(0, active["limit"] - active["used"]) if active["limit"] > 0 else -1, 0, active["limit"], active["window"], warning)
        if active["exceeded"]:
            return TokenBudgetDecision(False, True, False, 0, int(usage["retry_after_ms"]), active["limit"], active["window"], False)
        return TokenBudgetDecision(True, active["limit"] > 0, False, max(0, active["limit"] - active["used"]) if active["limit"] > 0 else -1, 0, active["limit"], active["window"], warning)

    def _usage_locked(self, key: str, options: TokenBudgetOptions) -> _UsageSnapshot:
        now = self._clock.now()
        state = self._states.get_or_create(key, lambda: _TokenBudgetState(deque()))
        records = deque(self._prune_records(list(state.records), now, self._max_window(options)))
        state.records = records
        hour = self._sum_within(list(records), now, 60 * 60 * 1000)
        day = self._sum_within(list(records), now, 24 * 60 * 60 * 1000)
        month = self._sum_within(list(records), now, 30 * 24 * 60 * 60 * 1000)
        active = self._active_window(hour, day, month, options)
        retry_after = self._determine_retry_after(list(records), now, options.hour_limit or 0, options.day_limit or 0, options.month_limit or 0)
        return {
            "hour": hour,
            "day": day,
            "month": month,
            "max_usage": active["used"],
            "retry_after_ms": retry_after,
            "window": active["window"],
        }

    def _extract_usage_from_chunk(self, chunk: object) -> TokenUsage | None:
        if hasattr(chunk, "usage"):
            usage = getattr(chunk, "usage")
            if usage is not None:
                extracted = self._usage_from_object(usage)
                if extracted is not None:
                    return extracted
        if isinstance(chunk, (str, bytes)):
            text = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
            return extract_token_usage_from_text(text)
        return self._usage_from_object(chunk)

    def _usage_from_object(self, value: object) -> TokenUsage | None:
        if value is None:
            return None
        if isinstance(value, TokenUsage):
            return value
        usage = getattr(value, "__dict__", None)
        if isinstance(usage, dict):
            input_tokens = int(usage.get("input_tokens", usage.get("prompt_tokens", 0)) or 0)
            output_tokens = int(usage.get("output_tokens", usage.get("completion_tokens", 0)) or 0)
            total_tokens = int(usage.get("total_tokens", input_tokens + output_tokens) or input_tokens + output_tokens)
            provider = usage.get("provider") if isinstance(usage.get("provider"), str) else None
            model = usage.get("model") if isinstance(usage.get("model"), str) else None
            if input_tokens == 0 and output_tokens == 0 and total_tokens == 0:
                return None
            return TokenUsage(provider=provider, model=model, input_tokens=input_tokens, output_tokens=output_tokens, total_tokens=total_tokens)
        return None

    def _max_window(self, options: TokenBudgetOptions) -> int:
        if (options.month_limit or 0) > 0:
            return 30 * 24 * 60 * 60 * 1000
        if (options.day_limit or 0) > 0:
            return 24 * 60 * 60 * 1000
        if (options.hour_limit or 0) > 0:
            return 60 * 60 * 1000
        return 0

    def _prune_records(self, records: list[_TokenBudgetRecord], now: float, max_window_ms: int) -> list[_TokenBudgetRecord]:
        if max_window_ms <= 0:
            return []
        cutoff = now - max_window_ms
        return [record for record in records if record.at > cutoff]

    def _sum_within(self, records: list[_TokenBudgetRecord], now: float, window_ms: int) -> int:
        cutoff = now - window_ms
        return sum(record.tokens for record in records if record.at > cutoff)

    def _determine_retry_after(self, records: list[_TokenBudgetRecord], now: float, hour_limit: int, day_limit: int, month_limit: int) -> int:
        windows = ((hour_limit, 60 * 60 * 1000), (day_limit, 24 * 60 * 60 * 1000), (month_limit, 30 * 24 * 60 * 60 * 1000))
        max_retry = 0
        for limit, window_ms in windows:
            if limit <= 0:
                continue
            total = self._sum_within(records, now, window_ms)
            if total < limit:
                continue
            for record in records:
                if record.at > now - window_ms:
                    max_retry = max(max_retry, int(record.at + window_ms - now))
                    break
        return max(0, max_retry)

    def _active_window(self, hour: int, day: int, month: int, options: TokenBudgetOptions) -> _ActiveWindow:
        hour_active = (options.hour_limit or 0) > 0
        day_active = (options.day_limit or 0) > 0
        month_active = (options.month_limit or 0) > 0
        if hour_active and (not day_active or (options.hour_limit or 0) <= (options.day_limit or 0)) and (not month_active or (options.hour_limit or 0) <= (options.month_limit or 0)):
            return {"window": "hour", "used": hour, "limit": options.hour_limit or 0, "exceeded": hour >= (options.hour_limit or 0)}
        if day_active and (not month_active or (options.day_limit or 0) <= (options.month_limit or 0)):
            return {"window": "day", "used": day, "limit": options.day_limit or 0, "exceeded": day >= (options.day_limit or 0)}
        if month_active:
            return {"window": "month", "used": month, "limit": options.month_limit or 0, "exceeded": month >= (options.month_limit or 0)}
        return {"window": "", "used": 0, "limit": 0, "exceeded": False}
