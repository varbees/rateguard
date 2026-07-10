from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Awaitable, Callable, Literal, Mapping, Protocol, Sequence, TypeAlias

if TYPE_CHECKING:
    from .core.adaptive import AdaptiveOptions
    from .core.genai import PricingProvider
    from .core.guardrails import GuardrailChain
    from .core.redis_limiter import AsyncRedisLimiterClient, RedisLimiterClient

PresetName = Literal["dev", "standard", "high-throughput", "llm-heavy", "strict-upstream-protection", "streaming-llm", "agent-orchestrator", "mcp-server"]
TokenBudgetMode = Literal["hard-stop", "soft-stop"]
CircuitBreakerState = Literal["closed", "open", "half-open"]
RateGuardEventType = Literal[
    "request.completed",
    "request.rate_limited",
    "request.token_budget_exceeded",
]
AdmissionErrorCode = Literal["circuit_open", "rate_limit_exceeded", "rate_limit_unavailable", "token_budget_exceeded"]

JsonPrimitive: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonPrimitive | dict[str, "JsonValue"] | list["JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]
HeaderValue: TypeAlias = str | bytes | bytearray | int | float | Sequence[str | bytes | bytearray] | None
HeadersLike: TypeAlias = Mapping[str, HeaderValue]


class Clock(Protocol):
    def now(self) -> float: ...


class EventEmitterLike(Protocol):
    async def emit(self, event: "RateGuardEventEnvelope") -> None: ...


@dataclass(slots=True)
class PolicyPreset:
    name: PresetName
    requests_per_second: int
    burst: int
    max_apis: int
    monthly_request_limit: int
    max_requests_per_day: int
    max_requests_per_month: int
    max_tokens_per_month: int
    token_budget_per_hour: int
    token_budget_per_day: int
    token_budget_per_month: int
    token_budget_mode: TokenBudgetMode
    advanced_analytics: bool
    priority_support: bool
    custom_rate_limits: bool
    webhooks: bool
    api_access: bool
    analytics_retention_days: int


@dataclass(slots=True)
class RateLimitOptions:
    requests_per_second: int | None = None
    burst: int | None = None
    window_ms: int | None = None
    remote_rate_limit_endpoint: str | None = None


@dataclass(slots=True)
class TokenBudgetOptions:
    hour_limit: int | None = None
    day_limit: int | None = None
    month_limit: int | None = None
    mode: TokenBudgetMode | None = None
    soft_stop_at: float | None = None


@dataclass(slots=True)
class CircuitBreakerOptions:
    error_rate_threshold: float | None = None
    open_timeout_ms: int | None = None
    half_open_successes_required: int | None = None
    sample_size: int | None = None


@dataclass(slots=True)
class RateGuardOptions:
    api_key: str | None = None
    preset: str | None = None
    tenant_id: str | None = None
    route_id: str | None = None
    upstream_id: str | None = None
    provider: str | None = None
    model: str | None = None
    control_plane_url: str | None = None
    ws_url: str | None = None
    key_fn: Callable[["RequestContext"], str] | None = None
    rate_limit: RateLimitOptions | None = None
    token_budget: TokenBudgetOptions | None = None
    circuit_breaker: CircuitBreakerOptions | None = None
    event_emitter: EventEmitterLike | None = None
    clock: Clock | None = None
    # HTTP webhook endpoint events are POSTed to when no event_emitter is
    # set. Mirrors Go's cfg.EventEndpoint. Delivery is wrapped in
    # AsyncEventEmitter (bounded queue, never blocks the request path).
    event_endpoint: str | None = None
    # Bounds the async event queue used with event_endpoint. None means
    # the default (1024).
    event_queue_size: int | None = None
    # Content guardrail chain checked against request bodies (PII, prompt
    # injection, length). Mirrors Go's cfg.Guardrails — None (default)
    # disables the check entirely.
    guardrails: "GuardrailChain | None" = None
    # Supplies USD-per-1K-token prices for cost estimates, checked before the
    # built-in starter table. Bring your own, or use StaticPricing for a map of
    # custom/fine-tuned/not-yet-tabled models. Mirrors Go's cfg.PricingProvider.
    # Cost is an observability estimate only — it never drives enforcement.
    pricing_provider: "PricingProvider | None" = None
    # Enables agent loop detection for requests carrying an
    # X-Sequence-Depth header. Mirrors Go's cfg.LoopDetection. Opt-in.
    loop_detection: bool = False
    # Bounds hard-stop token budget reservations: zero (default) reserves
    # the entire remaining budget per in-flight request (serializes
    # concurrent requests on the same key); a positive value reserves
    # min(estimate, remaining) so concurrent requests can proceed. Mirrors
    # Go's cfg.EstimatedTokensPerRequest.
    estimated_tokens_per_request: int = 0
    # adaptive_rate_limit auto-tunes the effective rate limit from observed
    # upstream outcomes: healthy traffic grows the limit additively, error
    # rates above target cut it multiplicatively — before the circuit
    # breaker has to trip. The configured rate_limit policy stays the
    # anchor; see AdaptiveOptions for bounds. Mirrors Go's
    # cfg.AdaptiveRateLimit.
    adaptive_rate_limit: bool = False
    # adaptive overrides the adaptive control loop defaults. Ignored unless
    # adaptive_rate_limit is True. Mirrors Go's cfg.Adaptive.
    adaptive: "AdaptiveOptions | None" = None
    # redis_client, when set, switches the rate limiter backend from the
    # default in-process limiter to a Redis-backed distributed GCRA
    # limiter (see core/redis_limiter.py) — mirrors Go's cfg.RedisClient
    # and New()'s `case cfg.RedisClient != nil` branch. Bring your own
    # already-constructed client adapted to RedisLimiterClient (sync) and
    # optionally redis_async_client for a real async path.
    redis_client: "RedisLimiterClient | None" = None
    redis_async_client: "AsyncRedisLimiterClient | None" = None
    # Sets Access-Control-Allow-Origin on admin_asgi_app's responses to this
    # exact value (e.g. "http://localhost:3001" for a locally-run
    # dashboard) — never "*". None (default) omits CORS headers entirely:
    # the admin API then only answers same-origin requests. Mirrors Go's
    # cfg.AdminCORSOrigin.
    admin_cors_origin: str | None = None


@dataclass(slots=True)
class ResolvedRateGuardOptions:
    api_key: str | None
    preset: PolicyPreset
    tenant_id: str
    route_id: str
    upstream_id: str
    provider: str | None
    model: str | None
    control_plane_url: str | None
    ws_url: str | None
    key_fn: Callable[["RequestContext"], str] | None
    rate_limit: RateLimitOptions
    token_budget: TokenBudgetOptions
    circuit_breaker: CircuitBreakerOptions
    event_emitter: EventEmitterLike | None
    clock: Clock
    event_endpoint: str | None
    event_queue_size: int | None
    guardrails: "GuardrailChain | None"
    pricing_provider: "PricingProvider | None"
    loop_detection: bool
    estimated_tokens_per_request: int
    adaptive_rate_limit: bool
    adaptive: "AdaptiveOptions | None"
    redis_client: "RedisLimiterClient | None"
    redis_async_client: "AsyncRedisLimiterClient | None"
    admin_cors_origin: str | None


@dataclass(slots=True)
class RequestContext:
    method: str
    path: str
    headers: HeadersLike
    request_id: str
    trace_id: str
    tenant_id: str
    route_id: str
    upstream_id: str
    provider: str | None = None
    model: str | None = None


@dataclass(slots=True)
class ResponseSnapshot:
    headers: HeadersLike
    body: str
    status_code: int


@dataclass(slots=True)
class TokenUsage:
    provider: str | None = None
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@dataclass(slots=True)
class RateLimitDecision:
    allowed: bool
    applied: bool
    remaining: int
    retry_after_ms: int
    limit: int
    degraded: bool


@dataclass(slots=True)
class BucketState:
    """Raw, read-only bucket state for one key — the facts a
    RateLimitDecision is computed from, without the allow/deny framing."""

    tokens: float
    capacity: int
    limit: int


@dataclass(slots=True)
class TokenBudgetDecision:
    allowed: bool
    applied: bool
    queued: bool
    remaining: int
    retry_after_ms: int
    limit: int
    window: Literal["hour", "day", "month", ""]
    warning: bool


@dataclass(slots=True)
class CircuitBreakerDecision:
    allowed: bool
    state: CircuitBreakerState
    retry_after_ms: int
    probe_in_flight: bool


@dataclass(slots=True)
class RateGuardEventPayload:
    request_id: str | None = None
    method: str = ""
    path: str = ""
    status_code: int = 200
    latency_ms: int = 0
    rate_limit_applied: bool = False
    rate_limit_allowed: bool = True
    rate_limit_limit: int = 0
    rate_limit_remaining: int = -1
    retry_after_ms: int | None = None
    preset: str = ""
    circuit_breaker_state: CircuitBreakerState = "closed"
    queue_depth: int = 0
    token_provider: str | None = None
    token_model: str | None = None
    token_input_tokens: int | None = None
    token_output_tokens: int | None = None
    token_total_tokens: int | None = None
    token_budget_mode: TokenBudgetMode | None = None
    token_budget_applied: bool = False
    token_budget_queued: bool = False
    token_budget_wait_ms: int | None = None
    token_budget_limit: int | None = None
    token_budget_remaining: int | None = None


@dataclass(slots=True)
class RateGuardEvent:
    event_id: str
    event_type: RateGuardEventType
    tenant_id: str | None
    route_id: str | None
    upstream_id: str | None
    trace_id: str | None
    occurred_at: str
    payload: RateGuardEventPayload


RateGuardEventEnvelope = RateGuardEvent


@dataclass(slots=True)
class PreflightDecision:
    allowed: bool
    status_code: int | None = None
    error_code: AdmissionErrorCode | None = None
    body: str | None = None
    retry_after_ms: int | None = None
    rate_limit: RateLimitDecision | None = None
    token_budget: TokenBudgetDecision | None = None
    circuit_breaker: CircuitBreakerDecision | None = None
    token_budget_reservation_id: str | None = None
    # Pre-built {"error": ..., "message": ...} rejection body for
    # loop-detection (429) and guardrail (422) denials — these don't fit
    # the standard {"error": ..., "retry_after_ms": ...} denial shape, so
    # adapters prefer this over denial_payload() when it is set.
    rejection_payload: dict[str, str] | None = None


@dataclass(slots=True)
class RequestBodyRejection:
    """Outcome of runtime.check_request_body: the request must be blocked
    with this status code, error code, and message — mirrors Go's inline
    429 loop_detected / 422 guardrail responses in checkRequestBody."""

    status_code: int
    error: str
    message: str


@dataclass(slots=True)
class CompletionObservation:
    status_code: int
    snapshot: ResponseSnapshot | None = None
    error: Exception | None = None
    token_budget_reservation_id: str | None = None
