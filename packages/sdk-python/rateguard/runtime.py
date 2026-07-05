from __future__ import annotations

from inspect import isawaitable
from typing import Awaitable, cast
import asyncio
import logging

from .config import resolve_rateguard_options
from .core.circuit_breaker import CircuitBreaker
from .core.event_emitter import build_event_envelope, create_event_emitter
from .core.guardrail_log import GuardrailLog
from .core.mcp import LoopDetector
from .core.rate_limiter import RateLimiter
from .core.token_budget import TokenBudgetManager
from .core.utils import read_first_header
from .types import CircuitBreakerState, CompletionObservation, PreflightDecision, RateGuardEventPayload, RateGuardEventType, RateGuardOptions, RateLimitDecision, RequestBodyRejection, RequestContext, TokenBudgetDecision, TokenUsage

logger = logging.getLogger(__name__)

# Bounds how much request body loop detection and guardrails read. Mirrors
# Go's sdk.go maxInspectedBodyBytes — bodies beyond the cap are checked on
# their prefix only.
MAX_INSPECTED_BODY_BYTES = 256 * 1024


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
        self.loop_detector = LoopDetector()
        self.guardrail_log = GuardrailLog()

    def wants_request_body(self, request: RequestContext) -> bool:
        """Whether this request needs its body read for loop detection or
        content guardrail inspection. Adapters call this BEFORE consuming
        the body so requests that don't need inspection never pay the
        cost of buffering it. Mirrors the loopActive/guardActive gates in
        Go's checkRequestBody."""
        loop_active = self.config.loop_detection and read_first_header(request.headers, ["x-sequence-depth"]) != ""
        guard_active = self.config.guardrails is not None and request.method not in ("GET", "HEAD")
        return bool(loop_active or guard_active)

    def check_request_body(self, request: RequestContext, body_text: str) -> RequestBodyRejection | None:
        """Runs loop detection and content guardrails against an already-
        read request body (bounded to MAX_INSPECTED_BODY_BYTES by the
        caller). Mirrors Go's SDK.checkRequestBody. Returns None when the
        request may proceed, or a rejection when it must be blocked (429
        loop, 422 guardrail) — the caller must not invoke the downstream
        handler in that case."""
        loop_active = self.config.loop_detection and read_first_header(request.headers, ["x-sequence-depth"]) != ""
        guard_active = self.config.guardrails is not None and request.method not in ("GET", "HEAD")

        if not loop_active and not guard_active:
            return None

        if loop_active:
            depth_header = read_first_header(request.headers, ["x-sequence-depth"])
            try:
                depth = int(depth_header)
            except ValueError:
                depth = None
            if depth is not None:
                fingerprint = read_first_header(request.headers, ["x-payload-fingerprint"])
                if not fingerprint:
                    fingerprint = LoopDetector.fingerprint(request.method, request.path, body_text)
                allowed, reason = self.loop_detector.check(fingerprint, depth)
                if not allowed:
                    return RequestBodyRejection(status_code=429, error="loop_detected", message=reason)

        if guard_active and body_text and self.config.guardrails is not None:
            violation = self.config.guardrails.check(body_text)
            if violation is not None:
                self.guardrail_log.record(violation)
                return RequestBodyRejection(status_code=422, error=violation.code, message=violation.message)

        return None

    def resolve_key(self, request: RequestContext) -> str:
        if self.config.key_fn is not None:
            resolved = self.config.key_fn(request).strip()
            if resolved:
                return resolved
        return ":".join((request.tenant_id, request.route_id, request.upstream_id, request.method))

    def admit(self, request: RequestContext, body_text: str | None = None) -> PreflightDecision:
        return self._admit_sync(request, body_text)

    async def admit_async(self, request: RequestContext, body_text: str | None = None) -> PreflightDecision:
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

        # Agent loop detection + content guardrails inspect the request
        # body. Runs after rate limiting but before token budget
        # reservation — same order as Go's handleHTTP/checkRequestBody.
        if body_text is not None:
            rejection = self.check_request_body(request, body_text)
            if rejection is not None:
                return PreflightDecision(
                    allowed=False,
                    status_code=rejection.status_code,
                    retry_after_ms=0,
                    rejection_payload={"error": rejection.error, "message": rejection.message},
                    rate_limit=rate_decision,
                    circuit_breaker=breaker_decision,
                )

        reservation = await self.token_budget.reserve_async(key, self.config.token_budget, self.config.estimated_tokens_per_request)
        token_decision = reservation.decision
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
        return PreflightDecision(allowed=True, rate_limit=rate_decision, token_budget=token_decision, circuit_breaker=breaker_decision, token_budget_reservation_id=reservation.reservation_id)

    def observe(self, request: RequestContext, observation: CompletionObservation, started_at_ms: float) -> None:
        self._observe_sync(request, observation, started_at_ms)

    async def observe_async(self, request: RequestContext, observation: CompletionObservation, started_at_ms: float) -> None:
        key = self.resolve_key(request)
        usage = None
        if observation.snapshot is not None:
            usage = self.token_budget.record_from_snapshot(key, observation.snapshot, observation.token_budget_reservation_id)
        else:
            self.token_budget.release_reservation(key, observation.token_budget_reservation_id)
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

    def _admit_sync(self, request: RequestContext, body_text: str | None = None) -> PreflightDecision:
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

        # Agent loop detection + content guardrails inspect the request
        # body. Runs after rate limiting but before token budget
        # reservation — same order as Go's handleHTTP/checkRequestBody.
        if body_text is not None:
            rejection = self.check_request_body(request, body_text)
            if rejection is not None:
                return PreflightDecision(
                    allowed=False,
                    status_code=rejection.status_code,
                    retry_after_ms=0,
                    rejection_payload={"error": rejection.error, "message": rejection.message},
                    rate_limit=rate_decision,
                    circuit_breaker=breaker_decision,
                )

        reservation = self.token_budget.reserve(key, self.config.token_budget, self.config.estimated_tokens_per_request)
        token_decision = reservation.decision
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
        return PreflightDecision(allowed=True, rate_limit=rate_decision, token_budget=token_decision, circuit_breaker=breaker_decision, token_budget_reservation_id=reservation.reservation_id)

    def _observe_sync(self, request: RequestContext, observation: CompletionObservation, started_at_ms: float) -> None:
        key = self.resolve_key(request)
        usage = None
        if observation.snapshot is not None:
            usage = self.token_budget.record_from_snapshot(key, observation.snapshot, observation.token_budget_reservation_id)
        else:
            self.token_budget.release_reservation(key, observation.token_budget_reservation_id)
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
