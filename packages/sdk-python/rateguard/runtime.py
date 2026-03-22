from __future__ import annotations

from contextlib import asynccontextmanager
from inspect import isawaitable
from typing import AsyncIterable, AsyncIterator, Awaitable, Callable, cast
import asyncio

from .config import resolve_rateguard_options
from .core.circuit_breaker import CircuitBreaker
from .core.event_emitter import build_event_envelope, create_event_emitter
from .core.rate_limiter import RateLimiter
from .core.token_budget import TokenBudgetManager
from .exceptions import BudgetExceeded, RateGuardException
from .types import CircuitBreakerDecision, CircuitBreakerOptions, CircuitBreakerState, Clock, CompletionObservation, EventEmitterLike, PreflightDecision, RateGuardEventPayload, RateGuardEventType, RateGuardOptions, RateLimitDecision, RateLimitOptions, RequestContext, ResponseSnapshot, TokenBudgetDecision, TokenBudgetOptions, TokenUsage


def _request_context_from_object(request: object, *, tenant_id: str, route_id: str, upstream_id: str, provider: str | None, model: str | None) -> RequestContext:
    method = str(getattr(request, "method", "GET")).upper()
    url = getattr(request, "url", None)
    path = str(getattr(url, "path", getattr(request, "path", "/")))
    headers = getattr(request, "headers", {}) or {}
    request_id = str(headers.get("x-request-id", "")) if hasattr(headers, "get") else ""
    trace_id = str(headers.get("traceparent", "")) if hasattr(headers, "get") else ""
    if not request_id:
        request_id = path
    if not trace_id:
        trace_id = request_id
    return RequestContext(method, path, headers, request_id, trace_id, tenant_id, route_id, upstream_id, provider, model)


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
        key = self.resolve_key(request)
        breaker_decision = await self.circuit_breaker.allow_async()
        if not breaker_decision.allowed:
            return PreflightDecision(False, 503, None, breaker_decision.retry_after_ms, None, None, breaker_decision)

        rate_decision = await self.rate_limiter.allow_async(key, self.config.rate_limit, api_key=self.config.api_key)
        if not rate_decision.allowed:
            await self.emit("request.rate_limited", request, breaker_decision.state, 429, self.config.clock.now(), rate_decision, None, rate_decision.retry_after_ms)
            return PreflightDecision(False, 429, None, rate_decision.retry_after_ms, rate_decision, None, breaker_decision)

        token_decision = await self.token_budget.check_async(key, self.config.token_budget)
        if not token_decision.allowed:
            await self.emit("request.token_budget_exceeded", request, breaker_decision.state, 429, self.config.clock.now(), rate_decision, token_decision, token_decision.retry_after_ms)
            return PreflightDecision(False, 429, None, token_decision.retry_after_ms, rate_decision, token_decision, breaker_decision)
        return PreflightDecision(True, None, None, None, rate_decision, token_decision, breaker_decision)

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
        rate_applied = getattr(rate_limit, "applied", True) if rate_limit is not None else True
        rate_allowed = getattr(rate_limit, "allowed", True) if rate_limit is not None else True
        rate_limit_limit = getattr(rate_limit, "limit", self.config.rate_limit.requests_per_second)
        rate_limit_remaining = getattr(rate_limit, "remaining", -1)
        token_applied = getattr(token_budget, "applied", False) if token_budget is not None else False
        token_queued = getattr(token_budget, "queued", False) if token_budget is not None else False
        token_limit = getattr(token_budget, "limit", None)
        token_remaining = getattr(token_budget, "remaining", None)
        token_wait = getattr(token_budget, "retry_after_ms", None)
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
        awaitable = cast(Awaitable[object], result)
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(awaitable)
        else:
            asyncio.ensure_future(awaitable)

    def _admit_sync(self, request: RequestContext) -> PreflightDecision:
        key = self.resolve_key(request)
        breaker_decision = self.circuit_breaker.allow()
        if not breaker_decision.allowed:
            return PreflightDecision(False, 503, None, breaker_decision.retry_after_ms, None, None, breaker_decision)

        rate_decision = self.rate_limiter.allow(key, self.config.rate_limit, api_key=self.config.api_key)
        if not rate_decision.allowed:
            return PreflightDecision(False, 429, None, rate_decision.retry_after_ms, rate_decision, None, breaker_decision)

        token_decision = self.token_budget.check(key, self.config.token_budget)
        if not token_decision.allowed:
            return PreflightDecision(False, 429, None, token_decision.retry_after_ms, rate_decision, token_decision, breaker_decision)
        return PreflightDecision(True, None, None, None, rate_decision, token_decision, breaker_decision)

    def _observe_sync(self, request: RequestContext, observation: CompletionObservation, started_at_ms: float) -> None:
        key = self.resolve_key(request)
        usage = None
        if observation.snapshot is not None:
            usage = self.token_budget.record_from_snapshot(key, observation.snapshot)
        success = observation.error is None and observation.status_code < 500
        breaker_decision = self.circuit_breaker.record_outcome(success)
        payload = self.build_payload(request, breaker_decision.state, observation.status_code, started_at_ms, None, None, usage, breaker_decision.retry_after_ms)
        self._emit_event_sync("request.completed", request, payload)


class RateGuard:
    """User-facing SDK facade."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        preset: str | None = None,
        tenant_id: str | None = None,
        route_id: str | None = None,
        upstream_id: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        control_plane_url: str | None = None,
        ws_url: str | None = None,
        key_fn: Callable[[RequestContext], str] | None = None,
        rate_limit: RateLimitOptions | None = None,
        token_budget: TokenBudgetOptions | None = None,
        circuit_breaker: CircuitBreakerOptions | None = None,
        event_emitter: EventEmitterLike | None = None,
        clock: Clock | None = None,
    ) -> None:
        self.options = RateGuardOptions(
            api_key=api_key,
            preset=preset,
            tenant_id=tenant_id,
            route_id=route_id,
            upstream_id=upstream_id,
            provider=provider,
            model=model,
            control_plane_url=control_plane_url,
            ws_url=ws_url,
            key_fn=key_fn,
            rate_limit=rate_limit,
            token_budget=token_budget,
            circuit_breaker=circuit_breaker,
            event_emitter=event_emitter,
            clock=clock,
        )
        self.runtime = RateGuardRuntime(self.options)

    @property
    def asgi_middleware(self) -> type:
        from .adapters.asgi import RateGuardMiddleware as Middleware

        runtime = self.runtime

        class BoundMiddleware(Middleware):
            def __init__(self, app: Callable[[dict[str, object], Callable, Callable], object]) -> None:
                super().__init__(app, runtime)

        return BoundMiddleware

    @property
    def wsgi_middleware(self) -> type:
        from .adapters.wsgi import RateGuardMiddleware as Middleware

        runtime = self.runtime

        class BoundMiddleware(Middleware):
            def __init__(self, app: Callable[..., object]) -> None:
                super().__init__(app, guard=runtime)

        return BoundMiddleware

    async def require(self, request: object) -> None:
        request_context = _request_context_from_object(
            request,
            tenant_id=self.runtime.config.tenant_id,
            route_id=self.runtime.config.route_id,
            upstream_id=self.runtime.config.upstream_id,
            provider=self.runtime.config.provider,
            model=self.runtime.config.model,
        )
        decision = await self.runtime.admit_async(request_context)
        if not decision.allowed:
            raise RateGuardException(
                "rate limited",
                status=decision.status_code or 429,
                retry_after=decision.retry_after_ms or 0,
            )

    @property
    def budget(self) -> "BudgetFacade":
        return BudgetFacade(self.runtime)

    def token_budget(
        self,
        *,
        hard_stop: bool = True,
        monthly_limit: int = 0,
        soft_stop_at: float = 0.8,
        hourly_limit: int = 0,
        daily_limit: int = 0,
    ):
        from .core.token_budget import TokenBudgetManager

        return TokenBudgetManager(
            clock=self.runtime.config.clock,
            hour_limit=hourly_limit,
            day_limit=daily_limit,
            month_limit=monthly_limit,
            mode="hard-stop" if hard_stop else "soft-stop",
            soft_stop_at=soft_stop_at,
            event_emitter=self.runtime.event_emitter,
            capacity=50_000,
        )


class BudgetFacade:
    """Friendly token-budget wrapper for the noob quickstart path."""

    def __init__(self, runtime: RateGuardRuntime) -> None:
        self._runtime = runtime

    def _resolve_key(self, user_id: str | None = None, *, key: str | None = None) -> str:
        resolved = (user_id or key or "").strip()
        if not resolved:
            raise ValueError("user_id is required")
        return resolved

    def check(self, *, user_id: str | None = None, key: str | None = None) -> TokenBudgetDecision:
        resolved = self._resolve_key(user_id, key=key)
        return self._runtime.token_budget.check(resolved, self._runtime.config.token_budget)

    async def check_async(self, *, user_id: str | None = None, key: str | None = None) -> TokenBudgetDecision:
        resolved = self._resolve_key(user_id, key=key)
        return await self._runtime.token_budget.check_async(resolved, self._runtime.config.token_budget)

    def record(self, *, user_id: str | None = None, tokens: int, key: str | None = None) -> None:
        resolved = self._resolve_key(user_id, key=key)
        self._runtime.token_budget.record(resolved, tokens)

    async def record_async(self, *, user_id: str | None = None, tokens: int, key: str | None = None) -> None:
        resolved = self._resolve_key(user_id, key=key)
        await self._runtime.token_budget.record_async(resolved, tokens)

    def usage(self, *, user_id: str | None = None, key: str | None = None) -> dict[str, int | str]:
        resolved = self._resolve_key(user_id, key=key)
        return self._runtime.token_budget.usage(resolved, self._runtime.config.token_budget)

    async def track_stream(self, stream: AsyncIterable[object], *, user_id: str | None = None, key: str | None = None) -> AsyncIterator[object]:
        resolved = self._resolve_key(user_id, key=key)
        async for chunk in self._runtime.token_budget.track_stream(stream, resolved):
            yield chunk

    @asynccontextmanager
    async def enforce(self, *, user_id: str | None = None, hard_stop: bool = True, key: str | None = None):
        resolved = self._resolve_key(user_id, key=key)
        decision = await self._runtime.token_budget.check_async(resolved, self._runtime.config.token_budget)
        if not decision.allowed and hard_stop:
            usage = self._runtime.token_budget.usage(resolved, self._runtime.config.token_budget)
            used = int(usage.get(decision.window or "month", usage.get("month", 0)) or 0)
            raise BudgetExceeded.from_decision(
                used=used,
                limit=decision.limit,
                window=decision.window or "month",
                retry_after_ms=decision.retry_after_ms,
                retry_after_at_ms=self._runtime.config.clock.now() + max(0, decision.retry_after_ms),
            )
        yield
