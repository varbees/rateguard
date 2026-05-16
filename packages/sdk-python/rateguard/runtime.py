from __future__ import annotations

from inspect import isawaitable
from typing import Awaitable, cast
import asyncio
import logging

from .config import resolve_rateguard_options
from .core.circuit_breaker import CircuitBreaker
from .core.event_emitter import build_event_envelope, create_event_emitter
from .core.rate_limiter import RateLimiter
from .core.token_budget import TokenBudgetManager
from .types import CircuitBreakerState, CompletionObservation, PreflightDecision, RateGuardEventPayload, RateGuardEventType, RateGuardOptions, RateLimitDecision, RequestContext, TokenBudgetDecision, TokenUsage

logger = logging.getLogger(__name__)


class RateGuardRuntime:
    def __init__(self, options: RateGuardOptions) -> None:
        self.config = resolve_rateguard_options(options)
        self.rate_limiter = RateLimiter(self.config.clock, capacity=50_000)
        self.token_budget = TokenBudgetManager(
            clock=self.config.clock,
            hour_limit=self.config.token_budget.hour_limit or 0,
            day_limit=self.config.token_budget.day_limit or 0,
            month_limit=self.config.token_budget.month_limit or 0,
            mode=self.config.token_budget.mode or "hard-stop",
            soft_stop_at=self.config.token_budget.soft_stop_at or 0.8,
            event_emitter=self.config.event_emitter,
            capacity=50_000,
        )
        self.circuit_breaker = CircuitBreaker(self.config.clock, self.config.circuit_breaker)
        self.event_emitter = create_event_emitter(self.config)

    def resolve_key(self, request: RequestContext) -> str:
        if self.config.key_fn is not None:
            resolved = self.config.key_fn(request).strip()
            if resolved:
                return resolved
        return ":".join((request.tenant_id, request.route_id, request.upstream_id, request.method))

    def admit(self, request: RequestContext) -> PreflightDecision:
        return self._admit_sync(request)

    async def admit_async(self, request: RequestContext) -> PreflightDecision:
        start_ms = self.config.clock.now()
        key = self.resolve_key(request)
        breaker_decision = await self.circuit_breaker.allow_async()
        if not breaker_decision.allowed:
            await self.emit("request.completed", request, breaker_decision.state, 503, start_ms, None, None, breaker_decision.retry_after_ms)
            return PreflightDecision(
                allowed=False,
                status_code=503,
                error_code="circuit_open",
                retry_after_ms=breaker_decision.retry_after_ms,
                circuit_breaker=breaker_decision,
            )

        rate_decision = await self.rate_limiter.allow_async(key, self.config.rate_limit, api_key=self.config.api_key)
        if not rate_decision.allowed:
            await self.emit("request.rate_limited", request, breaker_decision.state, 429, start_ms, rate_decision, None, rate_decision.retry_after_ms)
            return PreflightDecision(
                allowed=False,
                status_code=429,
                error_code="rate_limit_exceeded",
                retry_after_ms=rate_decision.retry_after_ms,
                rate_limit=rate_decision,
                circuit_breaker=breaker_decision,
            )

        token_decision = await self.token_budget.check_async(key, self.config.token_budget)
        if not token_decision.allowed:
            await self.emit("request.token_budget_exceeded", request, breaker_decision.state, 429, start_ms, rate_decision, token_decision, token_decision.retry_after_ms)
            return PreflightDecision(
                allowed=False,
                status_code=429,
                error_code="token_budget_exceeded",
                retry_after_ms=token_decision.retry_after_ms,
                rate_limit=rate_decision,
                token_budget=token_decision,
                circuit_breaker=breaker_decision,
            )
        return PreflightDecision(allowed=True, rate_limit=rate_decision, token_budget=token_decision, circuit_breaker=breaker_decision)

    def observe(self, request: RequestContext, observation: CompletionObservation, started_at_ms: float) -> None:
        self._observe_sync(request, observation, started_at_ms)

    async def observe_async(self, request: RequestContext, observation: CompletionObservation, started_at_ms: float) -> None:
        key = self.resolve_key(request)
        usage = None
        if observation.snapshot is not None:
            usage = self.token_budget.record_from_snapshot(key, observation.snapshot)
        success = observation.error is None and observation.status_code < 500
        breaker_decision = self.circuit_breaker.record_outcome(success)
        payload = self.build_payload(request, breaker_decision.state, observation.status_code, started_at_ms, None, None, usage, breaker_decision.retry_after_ms)
        await self.emit_event("request.completed", request, breaker_decision.state, payload)

    def build_payload(
        self,
        request: RequestContext,
        circuit_state: CircuitBreakerState,
        status_code: int,
        start_ms: float,
        rate_limit: RateLimitDecision | None = None,
        token_budget: TokenBudgetDecision | None = None,
        usage: TokenUsage | None = None,
        retry_after_ms: int | None = None,
    ) -> RateGuardEventPayload:
        latency_ms = max(0, int(self.config.clock.now() - start_ms))
        rate_applied = rate_limit.applied if rate_limit is not None else True
        rate_allowed = rate_limit.allowed if rate_limit is not None else True
        rate_limit_limit = rate_limit.limit if rate_limit is not None else self.config.rate_limit.requests_per_second or 0
        rate_limit_remaining = rate_limit.remaining if rate_limit is not None else -1
        token_applied = token_budget.applied if token_budget is not None else False
        token_queued = token_budget.queued if token_budget is not None else False
        token_limit = token_budget.limit if token_budget is not None else None
        token_remaining = token_budget.remaining if token_budget is not None else None
        token_wait = token_budget.retry_after_ms if token_budget is not None else None
        return RateGuardEventPayload(
            request_id=request.request_id,
            method=request.method,
            path=request.path,
            status_code=status_code,
            latency_ms=latency_ms,
            rate_limit_applied=bool(rate_applied),
            rate_limit_allowed=bool(rate_allowed),
            rate_limit_limit=int(rate_limit_limit),
            rate_limit_remaining=int(rate_limit_remaining),
            retry_after_ms=retry_after_ms if retry_after_ms and retry_after_ms > 0 else None,
            preset=self.config.preset.name,
            circuit_breaker_state=circuit_state,
            queue_depth=0,
            token_provider=usage.provider if usage else None,
            token_model=usage.model if usage else None,
            token_input_tokens=usage.input_tokens if usage else None,
            token_output_tokens=usage.output_tokens if usage else None,
            token_total_tokens=usage.total_tokens if usage else None,
            token_budget_mode=self.config.token_budget.mode,
            token_budget_applied=bool(token_applied),
            token_budget_queued=bool(token_queued),
            token_budget_wait_ms=int(token_wait) if isinstance(token_wait, int) and token_wait > 0 else None,
            token_budget_limit=int(token_limit) if isinstance(token_limit, int) else None,
            token_budget_remaining=int(token_remaining) if isinstance(token_remaining, int) else None,
        )

    async def emit(self, event_type: RateGuardEventType, request: RequestContext, circuit_state: CircuitBreakerState, status_code: int, start_ms: float, rate_limit: RateLimitDecision | None = None, token_budget: TokenBudgetDecision | None = None, retry_after_ms: int | None = None, usage: TokenUsage | None = None) -> None:
        payload = self.build_payload(request, circuit_state, status_code, start_ms, rate_limit, token_budget, usage, retry_after_ms)
        await self.emit_event(event_type, request, circuit_state, payload)

    async def emit_event(self, event_type: RateGuardEventType, request: RequestContext, _circuit_state: CircuitBreakerState, payload: RateGuardEventPayload) -> None:
        await self.event_emitter.emit(
            build_event_envelope(
                event_type,
                payload,
                tenant_id=request.tenant_id,
                route_id=request.route_id,
                upstream_id=request.upstream_id,
                trace_id=request.trace_id,
            )
        )

    def _emit_event_sync(self, event_type: RateGuardEventType, request: RequestContext, payload: RateGuardEventPayload) -> None:
        result = self.event_emitter.emit(
            build_event_envelope(
                event_type,
                payload,
                tenant_id=request.tenant_id,
                route_id=request.route_id,
                upstream_id=request.upstream_id,
                trace_id=request.trace_id,
            )
        )
        if not isawaitable(result):
            return
        awaitable = cast(Awaitable[None], result)
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(_await_emit(awaitable))
        else:
            task = asyncio.ensure_future(awaitable)
            task.add_done_callback(_log_async_emit_failure)

    def _admit_sync(self, request: RequestContext) -> PreflightDecision:
        start_ms = self.config.clock.now()
        key = self.resolve_key(request)
        breaker_decision = self.circuit_breaker.allow()
        if not breaker_decision.allowed:
            payload = self.build_payload(request, breaker_decision.state, 503, start_ms, None, None, None, breaker_decision.retry_after_ms)
            self._emit_event_sync("request.completed", request, payload)
            return PreflightDecision(
                allowed=False,
                status_code=503,
                error_code="circuit_open",
                retry_after_ms=breaker_decision.retry_after_ms,
                circuit_breaker=breaker_decision,
            )

        rate_decision = self.rate_limiter.allow(key, self.config.rate_limit, api_key=self.config.api_key)
        if not rate_decision.allowed:
            payload = self.build_payload(request, breaker_decision.state, 429, start_ms, rate_decision, None, None, rate_decision.retry_after_ms)
            self._emit_event_sync("request.rate_limited", request, payload)
            return PreflightDecision(
                allowed=False,
                status_code=429,
                error_code="rate_limit_exceeded",
                retry_after_ms=rate_decision.retry_after_ms,
                rate_limit=rate_decision,
                circuit_breaker=breaker_decision,
            )

        token_decision = self.token_budget.check(key, self.config.token_budget)
        if not token_decision.allowed:
            payload = self.build_payload(request, breaker_decision.state, 429, start_ms, rate_decision, token_decision, None, token_decision.retry_after_ms)
            self._emit_event_sync("request.token_budget_exceeded", request, payload)
            return PreflightDecision(
                allowed=False,
                status_code=429,
                error_code="token_budget_exceeded",
                retry_after_ms=token_decision.retry_after_ms,
                rate_limit=rate_decision,
                token_budget=token_decision,
                circuit_breaker=breaker_decision,
            )
        return PreflightDecision(allowed=True, rate_limit=rate_decision, token_budget=token_decision, circuit_breaker=breaker_decision)

    def _observe_sync(self, request: RequestContext, observation: CompletionObservation, started_at_ms: float) -> None:
        key = self.resolve_key(request)
        usage = None
        if observation.snapshot is not None:
            usage = self.token_budget.record_from_snapshot(key, observation.snapshot)
        success = observation.error is None and observation.status_code < 500
        breaker_decision = self.circuit_breaker.record_outcome(success)
        payload = self.build_payload(request, breaker_decision.state, observation.status_code, started_at_ms, None, None, usage, breaker_decision.retry_after_ms)
        self._emit_event_sync("request.completed", request, payload)


def _log_async_emit_failure(task: asyncio.Future[None]) -> None:
    try:
        task.result()
    except Exception as exc:
        logger.warning("RateGuard async event emitter failed: %s", exc)


async def _await_emit(awaitable: Awaitable[None]) -> None:
    await awaitable
