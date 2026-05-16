"""RateGuard Python middleware SDK."""

from .adapters.asgi import RateGuardMiddleware as ASGIRateGuardMiddleware
from .adapters.decorators import rate_limited, token_budget
from .adapters.wsgi import RateGuardMiddleware as WSGIRateGuardMiddleware
from .config import normalize_preset, normalize_token_budget_mode, preset_policy, resolve_rateguard_options
from .core.circuit_breaker import CircuitBreaker
from .core.event_emitter import ConsoleEventEmitter, WebSocketEventEmitter
from .core.rate_limiter import RateLimiter
from .core.token_budget import TokenBudgetManager
from .exceptions import BudgetExceeded, RateGuardException
from .facade import RateGuard
from .types import (
    CircuitBreakerDecision,
    CircuitBreakerOptions,
    CircuitBreakerState,
    Clock,
    CompletionObservation,
    EventEmitterLike,
    HeadersLike,
    PolicyPreset,
    PresetName,
    RateGuardEvent,
    RateGuardEventEnvelope,
    RateGuardEventPayload,
    RateGuardEventType,
    RateGuardOptions,
    RateLimitDecision,
    RateLimitOptions,
    RequestContext,
    ResponseSnapshot,
    ResolvedRateGuardOptions,
    TokenBudgetDecision,
    TokenBudgetMode,
    TokenBudgetOptions,
    TokenUsage,
)

TokenBudget = TokenBudgetManager
RateGuardMiddleware = WSGIRateGuardMiddleware

__all__ = [
    "ASGIRateGuardMiddleware",
    "WSGIRateGuardMiddleware",
    "ConsoleEventEmitter",
    "WebSocketEventEmitter",
    "CircuitBreaker",
    "RateGuard",
    "BudgetExceeded",
    "RateGuardException",
    "RateGuardMiddleware",
    "RateLimiter",
    "TokenBudget",
    "TokenBudgetManager",
    "rate_limited",
    "token_budget",
    "normalize_preset",
    "normalize_token_budget_mode",
    "preset_policy",
    "resolve_rateguard_options",
    "CircuitBreakerDecision",
    "CircuitBreakerOptions",
    "CircuitBreakerState",
    "Clock",
    "CompletionObservation",
    "EventEmitterLike",
    "HeadersLike",
    "PolicyPreset",
    "PresetName",
    "RateGuardEvent",
    "RateGuardEventEnvelope",
    "RateGuardEventPayload",
    "RateGuardEventType",
    "RateGuardOptions",
    "RateLimitDecision",
    "RateLimitOptions",
    "RequestContext",
    "ResponseSnapshot",
    "ResolvedRateGuardOptions",
    "TokenBudgetDecision",
    "TokenBudgetMode",
    "TokenBudgetOptions",
    "TokenUsage",
]
