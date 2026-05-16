from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable, Literal, Mapping, Protocol, Sequence, TypeAlias

PresetName = Literal["dev", "standard", "high-throughput", "llm-heavy", "strict-upstream-protection"]
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


@dataclass(slots=True)
class CompletionObservation:
    status_code: int
    snapshot: ResponseSnapshot | None = None
    error: Exception | None = None
