from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, AsyncIterable, AsyncIterator, Callable

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
    from .adapters.asgi import ASGIApp
    from .adapters.wsgi import WSGIApp
    from .core.mcp import LoopDetector, MCPTool, MCPToolResult
    from .core.token_budget import TokenBudgetManager


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
        self._mcp_tools: list["MCPTool"] | None = None
        self._loop_detector: "LoopDetector | None" = None

    @property
    def loop_detector(self) -> "LoopDetector":
        from .core.mcp import LoopDetector

        if self._loop_detector is None:
            self._loop_detector = LoopDetector()
        return self._loop_detector

    def mcp_tools(self) -> list["MCPTool"]:
        """MCP tool set for agent pre-flight queries. Peek semantics — never consumes budget."""
        from .core.mcp import create_mcp_tools

        if self._mcp_tools is None:
            self._mcp_tools = create_mcp_tools(self.runtime, self.loop_detector)
        return self._mcp_tools

    def mcp_call(self, tool_name: str, args: dict | None = None) -> "MCPToolResult":
        """Execute an MCP tool by name and wrap the result as MCP content."""
        from .core.mcp import mcp_call

        return mcp_call(self.mcp_tools(), tool_name, args)

    def httpx_transport(self, **kwargs) -> object:
        """Sync httpx transport with outbound GenAI tracking.

        client = httpx.Client(transport=rg.httpx_transport())
        openai = OpenAI(http_client=client)
        """
        from .core.outbound import create_httpx_transport

        return create_httpx_transport(self.runtime, **kwargs)

    def wrap_httpx_client(self, client: object = None, **kwargs) -> object:
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

    def httpx_async_transport(self, **kwargs) -> object:
        """Async httpx transport with outbound GenAI tracking.

        client = httpx.AsyncClient(transport=rg.httpx_async_transport())
        set_default_openai_client(AsyncOpenAI(http_client=client))
        """
        from .core.outbound import create_httpx_async_transport

        return create_httpx_async_transport(self.runtime, **kwargs)

    def wrap_httpx_async_client(self, client: object = None, **kwargs) -> object:
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
    def wsgi_middleware(self) -> type:
        from .adapters.wsgi import RateGuardMiddleware as Middleware

        runtime = self.runtime

        class BoundMiddleware(Middleware):
            def __init__(self, app: WSGIApp) -> None:
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
