from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any, AsyncIterable, AsyncIterator, Callable

from .exceptions import RateGuardException
from .runtime import RateGuardRuntime
from .types import (
    CircuitBreakerOptions,
    Clock,
    EventEmitterLike,
    RateGuardOptions,
    RateLimitOptions,
    RequestContext,
    TokenBudgetDecision,
    TokenBudgetOptions,
)

if TYPE_CHECKING:
    import httpx

    from .adapters.asgi import ASGIApp
    from .adapters.wsgi import WSGIApp
    from .core.adaptive import AdaptiveLimiter, AdaptiveOptions
    from .core.admin import AdminApp
    from .core.genai import GenAICall, GenAISpan
    from .core.guardrail_log import GuardrailLog
    from .core.genai import PricingProvider
    from .core.guardrails import GuardrailChain
    from .core.mcp import LoopDetector, MCPTool, MCPToolResult
    from .core.token_budget import TokenBudgetManager

try:
    # A REAL (not TYPE_CHECKING-only) import, on purpose: FastAPI's
    # dependency injection recognizes a parameter as "give me the request"
    # only when its annotation IS (or subclasses) starlette.requests.Request
    # — it resolves annotations via typing.get_type_hints() against this
    # module's actual globals, so a string annotation pointing at a name
    # that was never really bound (e.g. a TYPE_CHECKING-only import) raises
    # NameError the moment a route wires up Depends(rg.require). Falls back
    # to plain object when starlette isn't installed — require() only gets
    # called by someone who has it (the fastapi extra), so this path never
    # actually executes without it; it just keeps `import rateguard` itself
    # dependency-free.
    from starlette.exceptions import HTTPException as _StarletteHTTPException
    from starlette.requests import Request as _StarletteRequest
except ImportError:  # pragma: no cover - fastapi/starlette extra not installed
    _StarletteRequest = object  # type: ignore[assignment,misc]
    _StarletteHTTPException = None  # type: ignore[assignment,misc]


def _request_context_from_object(
    request: object,
    *,
    tenant_id: str,
    route_id: str,
    upstream_id: str,
    provider: str | None,
    model: str | None,
) -> RequestContext:
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
        event_endpoint: str | None = None,
        event_queue_size: int | None = None,
        clock: Clock | None = None,
        guardrails: "GuardrailChain | None" = None,
        pricing_provider: "PricingProvider | None" = None,
        loop_detection: bool = False,
        estimated_tokens_per_request: int = 0,
        adaptive_rate_limit: bool = False,
        adaptive: "AdaptiveOptions | None" = None,
        redis_client: object | None = None,
        redis_async_client: object | None = None,
        admin_cors_origin: str | None = None,
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
            event_endpoint=event_endpoint,
            event_queue_size=event_queue_size,
            guardrails=guardrails,
            pricing_provider=pricing_provider,
            loop_detection=loop_detection,
            estimated_tokens_per_request=estimated_tokens_per_request,
            adaptive_rate_limit=adaptive_rate_limit,
            adaptive=adaptive,
            redis_client=redis_client,  # type: ignore[arg-type]
            redis_async_client=redis_async_client,  # type: ignore[arg-type]
            admin_cors_origin=admin_cors_origin,
        )
        self.runtime = RateGuardRuntime(self.options)
        self._mcp_tools: list["MCPTool"] | None = None

    def shutdown(self, timeout: float = 5.0) -> bool:
        """Drain the async event queue (see RateGuardRuntime.shutdown).
        Returns True when fully drained, False on timeout."""
        return self.runtime.shutdown(timeout)

    @property
    def adaptive_limiter(self) -> "AdaptiveLimiter | None":
        """The adaptive rate-limit controller, when adaptive_rate_limit was
        enabled — None otherwise. Mirrors Go's
        SDK.AdaptiveRateLimitFactor(): use .factor()/.error_rate() for
        introspection (dashboards, health checks)."""
        return self.runtime.adaptive_limiter

    @property
    def loop_detector(self) -> "LoopDetector":
        """Loop detector shared with the actual middleware admission path
        (not a separate standalone instance) — MCP pre-flight checks and
        real request-time loop detection see the same fingerprint state."""
        return self.runtime.loop_detector

    @property
    def guardrail_log(self) -> "GuardrailLog":
        """Guardrail violation log shared with the middleware's 422
        rejection path."""
        return self.runtime.guardrail_log

    def mcp_tools(self) -> list["MCPTool"]:
        """MCP tool set for agent pre-flight queries. Peek semantics — never consumes budget."""
        from .core.mcp import create_mcp_tools

        if self._mcp_tools is None:
            self._mcp_tools = create_mcp_tools(self.runtime, self.loop_detector, self.guardrail_log)
        return self._mcp_tools

    def mcp_call(self, tool_name: str, args: dict[str, Any] | None = None) -> "MCPToolResult":
        """Execute an MCP tool by name and wrap the result as MCP content."""
        from .core.mcp import mcp_call

        return mcp_call(self.mcp_tools(), tool_name, args)

    def start_genai_call(self, call: "GenAICall") -> "GenAISpan":
        """Public GenAI observability API: wrap an LLM call to track
        TTFT/TPOT/cost. Mirrors Go's SDK.StartGenAICall.

            span = rg.start_genai_call(GenAICall(model="gpt-4o", provider="openai", operation="chat"))
            for chunk in stream:
                span.record_chunk()
                ...
            span.end(GenAICall(model="gpt-4o", provider="openai",
                                prompt_tokens=usage.input, completion_tokens=usage.output))
        """
        from .core.genai import start_genai_call

        return start_genai_call(self.runtime, call)

    def httpx_transport(self, **kwargs: Any) -> "httpx.BaseTransport":
        """Sync httpx transport with outbound GenAI tracking.

        client = httpx.Client(transport=rg.httpx_transport())
        openai = OpenAI(http_client=client)
        """
        from .core.outbound import create_httpx_transport

        transport: httpx.BaseTransport = create_httpx_transport(self.runtime, **kwargs)
        return transport

    def wrap_httpx_client(self, client: "httpx.Client | None" = None, **kwargs: Any) -> "httpx.Client":
        """Return an httpx.Client whose transport tracks outbound LLM calls.

        Budgets, per-provider circuit breakers, and real token usage metering
        for every LLM API call — pass the result to any SDK that accepts a
        custom http client (OpenAI, Anthropic, ...).
        """
        import httpx  # lazy — not a hard dependency

        transport = self.httpx_transport(**kwargs)
        if client is None:
            return httpx.Client(transport=transport)
        # httpx has no public transport setter; build a fresh client that
        # carries over the caller's configuration.
        return httpx.Client(
            transport=transport,
            headers=client.headers,
            timeout=client.timeout,
            base_url=client.base_url,
        )

    def httpx_async_transport(self, **kwargs: Any) -> "httpx.AsyncBaseTransport":
        """Async httpx transport with outbound GenAI tracking.

        client = httpx.AsyncClient(transport=rg.httpx_async_transport())
        set_default_openai_client(AsyncOpenAI(http_client=client))
        """
        from .core.outbound import create_httpx_async_transport

        transport: httpx.AsyncBaseTransport = create_httpx_async_transport(self.runtime, **kwargs)
        return transport

    def wrap_httpx_async_client(self, client: "httpx.AsyncClient | None" = None, **kwargs: Any) -> "httpx.AsyncClient":
        """Return an httpx.AsyncClient whose transport tracks outbound LLM calls.

        Agent frameworks are async-first — pass the result to AsyncOpenAI /
        AsyncAnthropic, LangChain's http_async_client, Pydantic AI providers,
        or the OpenAI Agents SDK's set_default_openai_client.
        """
        import httpx  # lazy — not a hard dependency

        transport = self.httpx_async_transport(**kwargs)
        if client is None:
            return httpx.AsyncClient(transport=transport)
        return httpx.AsyncClient(
            transport=transport,
            headers=client.headers,
            timeout=client.timeout,
            base_url=client.base_url,
        )

    @property
    def asgi_middleware(self) -> type:
        from .adapters.asgi import RateGuardMiddleware as Middleware

        runtime = self.runtime

        class BoundMiddleware(Middleware):
            def __init__(self, app: ASGIApp) -> None:
                super().__init__(app, runtime)

        return BoundMiddleware

    @property
    def admin_asgi_app(self) -> "AdminApp":
        """Standalone admin/control-plane ASGI app for this instance —
        GET/PATCH policy, state snapshots, MCP tool catalog + invocation.
        Mirrors Go's SDK.AdminHandler(). UNAUTHENTICATED by design: bind it
        to localhost or an internal network only (same posture as pprof) —
        never mount it on the public app. See core/admin.py. CORS is
        controlled by the admin_cors_origin constructor option — omitted
        (the default) means no CORS headers at all, same-origin only."""
        from .core.admin import AdminApp

        return AdminApp(self, cors_origin=self.runtime.config.admin_cors_origin)

    @property
    def wsgi_middleware(self) -> type:
        from .adapters.wsgi import RateGuardMiddleware as Middleware

        runtime = self.runtime

        class BoundMiddleware(Middleware):
            def __init__(self, app: WSGIApp) -> None:
                super().__init__(app, guard=runtime)

        return BoundMiddleware

    async def require(self, request: _StarletteRequest) -> None:
        """FastAPI dependency: `Depends(rg.require)` — raises
        starlette.exceptions.HTTPException (429, or whatever
        admit_async's decision carries) when the request isn't allowed.
        Deliberately NOT RateGuardException: FastAPI/Starlette only
        auto-converts HTTPException into a response for you — anything
        else propagates as an unhandled exception (a 500 in production,
        a crash in tests) unless the caller registers their own exception
        handler, which nothing here prompts them to do. This calls
        admit_async independently of the ASGI middleware — use this OR
        app.add_middleware(rg.asgi_middleware) on a given route, not
        both, or one request would be admitted (and its rate limit/token
        budget consumed) twice."""
        if _StarletteHTTPException is None:
            raise RuntimeError("rateguard: rg.require needs the 'fastapi' extra (pip install varbees-rateguard[fastapi])")
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
            headers = {"Retry-After": str(max(1, round((decision.retry_after_ms or 0) / 1000)))} if decision.retry_after_ms else None
            raise _StarletteHTTPException(status_code=decision.status_code or 429, detail="rate limited", headers=headers)

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
    ) -> "TokenBudgetManager":
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
    """High-level token-budget API for callers that key budgets by user or tenant."""

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

    async def track_stream(
        self,
        stream: AsyncIterable[object],
        *,
        user_id: str | None = None,
        key: str | None = None,
    ) -> AsyncIterator[object]:
        resolved = self._resolve_key(user_id, key=key)
        async for chunk in self._runtime.token_budget.track_stream(stream, resolved):
            yield chunk

    @asynccontextmanager
    async def enforce(self, *, user_id: str | None = None, hard_stop: bool = True, key: str | None = None) -> AsyncIterator[None]:
        resolved = self._resolve_key(user_id, key=key)
        decision = await self._runtime.token_budget.check_async(resolved, self._runtime.config.token_budget)
        if not decision.allowed and hard_stop:
            raise self._runtime.token_budget.budget_exceeded(resolved, decision, self._runtime.config.token_budget)
        yield
