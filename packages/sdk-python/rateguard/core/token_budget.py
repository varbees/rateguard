from __future__ import annotations

from collections import deque
from collections.abc import Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threading import RLock
import asyncio
from typing import AsyncIterable, AsyncIterator, Literal, TypedDict

from .bounded_cache import BoundedCache
from .utils import extract_token_usage_from_headers, extract_token_usage_from_text
from ..exceptions import BudgetExceeded
from ..types import Clock, EventEmitterLike, ResponseSnapshot, TokenBudgetDecision, TokenBudgetMode, TokenBudgetOptions, TokenUsage


TokenBudgetWindow = Literal["hour", "day", "month", ""]
_RESERVATION_TTL_MS = 15 * 60 * 1000


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


@dataclass(slots=True)
class _TokenBudgetRecord:
    at: float
    tokens: int


@dataclass(slots=True)
class _TokenBudgetState:
    records: deque[_TokenBudgetRecord]
    reservations: dict[str, _TokenBudgetRecord]
    next_reservation_id: int = 0


@dataclass(slots=True)
class _TokenBudgetReservationResult:
    decision: TokenBudgetDecision
    reservation_id: str | None = None


class TokenBudgetManager:
    """Rolling-window token budget manager."""

    def __init__(
        self,
        *,
        clock: Clock,
        hour_limit: int,
        day_limit: int,
        month_limit: int,
        mode: TokenBudgetMode,
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

    def reserve(self, key: str, options: TokenBudgetOptions | None = None) -> _TokenBudgetReservationResult:
        with self._lock:
            return self._reserve_locked(key, options or self._limits)

    async def check_async(self, key: str, options: TokenBudgetOptions | None = None) -> TokenBudgetDecision:
        async with self._async_lock:
            return self._check_locked(key, options or self._limits)

    async def reserve_async(self, key: str, options: TokenBudgetOptions | None = None) -> _TokenBudgetReservationResult:
        async with self._async_lock:
            return self._reserve_locked(key, options or self._limits)

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
            return self._public_usage(self._usage_locked(key, options or self._limits))

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

    def record_from_snapshot(self, key: str, snapshot: ResponseSnapshot, reservation_id: str | None = None) -> TokenUsage | None:
        usage = extract_token_usage_from_headers(snapshot.headers) or extract_token_usage_from_text(snapshot.body)
        if usage is None:
            self.release_reservation(key, reservation_id)
            return None
        self.commit_reservation(key, reservation_id, usage.total_tokens)
        return usage

    def commit_reservation(self, key: str, reservation_id: str | None, tokens: int) -> None:
        if reservation_id is None:
            self.record(key, tokens)
            return
        with self._lock:
            state = self._states.get_or_create(key, self._new_state)
            state.reservations.pop(reservation_id, None)
            if tokens > 0:
                self._record_state_locked(state, tokens)

    def release_reservation(self, key: str, reservation_id: str | None) -> None:
        if reservation_id is None:
            return
        with self._lock:
            state = self._states.get_or_create(key, self._new_state)
            state.reservations.pop(reservation_id, None)

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
        state = self._states.get_or_create(key, self._new_state)
        self._record_state_locked(state, tokens)

    def _record_state_locked(self, state: _TokenBudgetState, tokens: int) -> None:
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

    def _reserve_locked(self, key: str, options: TokenBudgetOptions) -> _TokenBudgetReservationResult:
        decision = self._check_locked(key, options)
        if not decision.allowed or not decision.applied or options.mode != "hard-stop" or decision.remaining <= 0:
            return _TokenBudgetReservationResult(decision)

        state = self._states.get_or_create(key, self._new_state)
        state.next_reservation_id += 1
        reservation_id = str(state.next_reservation_id)
        state.reservations[reservation_id] = _TokenBudgetRecord(self._clock.now(), decision.remaining)
        return _TokenBudgetReservationResult(
            TokenBudgetDecision(
                decision.allowed,
                decision.applied,
                decision.queued,
                0,
                decision.retry_after_ms,
                decision.limit,
                decision.window,
                decision.warning,
            ),
            reservation_id,
        )

    def _usage_locked(self, key: str, options: TokenBudgetOptions) -> _UsageSnapshot:
        now = self._clock.now()
        state = self._states.get_or_create(key, self._new_state)
        max_window = self._max_window(options)
        self._prune_records(state.records, now, max_window)
        self._prune_reservations(state, now)
        records = self._active_records(state, now, max_window)
        hour = self._sum_within(records, now, 60 * 60 * 1000)
        day = self._sum_within(records, now, 24 * 60 * 60 * 1000)
        month = self._sum_within(records, now, 30 * 24 * 60 * 60 * 1000)
        active = self._active_window(hour, day, month, options)
        retry_after = self._determine_retry_after(records, now, options.hour_limit or 0, options.day_limit or 0, options.month_limit or 0)
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
        if isinstance(usage, Mapping):
            input_tokens = _int_field(usage, "input_tokens", "prompt_tokens")
            output_tokens = _int_field(usage, "output_tokens", "completion_tokens")
            total_tokens = _int_field(usage, "total_tokens", default=input_tokens + output_tokens)
            raw_provider = usage.get("provider")
            raw_model = usage.get("model")
            provider = raw_provider if isinstance(raw_provider, str) else None
            model = raw_model if isinstance(raw_model, str) else None
            if input_tokens == 0 and output_tokens == 0 and total_tokens == 0:
                return None
            return TokenUsage(provider=provider, model=model, input_tokens=input_tokens, output_tokens=output_tokens, total_tokens=total_tokens)
        return None

    def _public_usage(self, snapshot: _UsageSnapshot) -> dict[str, int | str]:
        return {
            "hour": snapshot["hour"],
            "day": snapshot["day"],
            "month": snapshot["month"],
            "max_usage": snapshot["max_usage"],
            "retry_after_ms": snapshot["retry_after_ms"],
            "window": snapshot["window"],
        }

    def _new_state(self) -> _TokenBudgetState:
        return _TokenBudgetState(deque(), {})

    def _max_window(self, options: TokenBudgetOptions) -> int:
        if (options.month_limit or 0) > 0:
            return 30 * 24 * 60 * 60 * 1000
        if (options.day_limit or 0) > 0:
            return 24 * 60 * 60 * 1000
        if (options.hour_limit or 0) > 0:
            return 60 * 60 * 1000
        return 0

    def _prune_records(self, records: deque[_TokenBudgetRecord], now: float, max_window_ms: int) -> None:
        if max_window_ms <= 0:
            records.clear()
            return
        cutoff = now - max_window_ms
        while records and records[0].at <= cutoff:
            records.popleft()

    def _prune_reservations(self, state: _TokenBudgetState, now: float) -> None:
        expired = [
            reservation_id
            for reservation_id, reservation in state.reservations.items()
            if now - reservation.at >= _RESERVATION_TTL_MS
        ]
        for reservation_id in expired:
            state.reservations.pop(reservation_id, None)

    def _active_records(self, state: _TokenBudgetState, now: float, max_window_ms: int) -> deque[_TokenBudgetRecord] | list[_TokenBudgetRecord]:
        if not state.reservations:
            return state.records
        cutoff = now - max_window_ms
        records: list[_TokenBudgetRecord] = list(state.records)
        records.extend(
            reservation
            for reservation in state.reservations.values()
            if max_window_ms <= 0 or reservation.at > cutoff
        )
        return records

    def _sum_within(self, records: deque[_TokenBudgetRecord] | list[_TokenBudgetRecord], now: float, window_ms: int) -> int:
        cutoff = now - window_ms
        return sum(record.tokens for record in records if record.at > cutoff)

    def _determine_retry_after(self, records: deque[_TokenBudgetRecord] | list[_TokenBudgetRecord], now: float, hour_limit: int, day_limit: int, month_limit: int) -> int:
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


def _int_field(usage: Mapping[object, object], primary: str, fallback: str | None = None, *, default: int = 0) -> int:
    raw = usage.get(primary)
    if raw is None and fallback is not None:
        raw = usage.get(fallback)
    if raw is None:
        return default
    if isinstance(raw, bool):
        return int(raw)
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    if isinstance(raw, str):
        try:
            return int(raw)
        except ValueError:
            return default
    return default
