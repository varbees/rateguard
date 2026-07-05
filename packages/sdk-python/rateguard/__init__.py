"""RateGuard Python middleware SDK."""

__version__ = "0.1.0"

from .adapters.asgi import RateGuardMiddleware as ASGIRateGuardMiddleware
from .adapters.decorators import rate_limited, token_budget
from .adapters.wsgi import RateGuardMiddleware as WSGIRateGuardMiddleware
from .config import known_presets, normalize_preset, normalize_token_budget_mode, preset_policy, resolve_rateguard_options
from .core.adaptive import AdaptiveLimiter, AdaptiveOptions
from .core.circuit_breaker import CircuitBreaker
from .core.event_emitter import ConsoleEventEmitter, HTTPEventEmitter, WebSocketEventEmitter
from .core.genai import GenAICall, GenAISpan, estimate_cost, genai_span_attributes, genai_span_end_attributes, priced_models, start_genai_call
from .core.guardrail_log import GuardrailEvent, GuardrailLog
from .core.guardrails import (
    Guardrail,
    GuardrailChain,
    GuardrailViolation,
    MaxLengthGuardrail,
    PIIGuardrail,
    PromptInjectionGuardrail,
    TokenLimitGuardrail,
    standard_guardrails,
    strict_guardrails,
)
from .core.mcp import LoopDetector, MCPTool, MCPToolResult, create_mcp_tools, mcp_call
from .core.outbound import (
    FallbackProvider,
    OutboundCall,
    create_httpx_async_transport,
    create_httpx_transport,
    detect_llm_call,
)
from .core.prometheus import prometheus_text
from .core.provider_chain import (
    ProviderChain,
    ProviderEntry,
    budget_provider_chain,
    default_provider_chain,
    quality_provider_chain,
)
from .core.rate_limiter import RateLimiter
from .core.semantic_cache import CachedResponse, Embedder, SemanticCache, SemanticCacheOptions, is_streaming_request_body, prompt_text_from_request_body
from .core.sharded_limiter import ShardedLimiter
from .core.token_budget import TokenBudgetManager
from .exceptions import BudgetExceeded, RateGuardException
from .facade import RateGuard
from .types import (
    BucketState,
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
    "__version__",
    "ASGIRateGuardMiddleware",
    "WSGIRateGuardMiddleware",
    "ConsoleEventEmitter",
    "HTTPEventEmitter",
    "WebSocketEventEmitter",
    "CircuitBreaker",
    "RateGuard",
    "BudgetExceeded",
    "RateGuardException",
    "RateGuardMiddleware",
    "RateLimiter",
    "ShardedLimiter",
    "AdaptiveLimiter",
    "AdaptiveOptions",
    "TokenBudget",
    "TokenBudgetManager",
    "rate_limited",
    "token_budget",
    "known_presets",
    "normalize_preset",
    "normalize_token_budget_mode",
    "preset_policy",
    "resolve_rateguard_options",
    "BucketState",
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
    # GenAI observability
    "GenAICall",
    "GenAISpan",
    "estimate_cost",
    "genai_span_attributes",
    "genai_span_end_attributes",
    "priced_models",
    "start_genai_call",
    # Guardrails
    "Guardrail",
    "GuardrailChain",
    "GuardrailViolation",
    "MaxLengthGuardrail",
    "PIIGuardrail",
    "PromptInjectionGuardrail",
    "TokenLimitGuardrail",
    "standard_guardrails",
    "strict_guardrails",
    # Guardrail violation tracking
    "GuardrailEvent",
    "GuardrailLog",
    # MCP + loop detection
    "LoopDetector",
    "MCPTool",
    "MCPToolResult",
    "create_mcp_tools",
    "mcp_call",
    # Outbound GenAI transport
    "FallbackProvider",
    "OutboundCall",
    "create_httpx_transport",
    "create_httpx_async_transport",
    "detect_llm_call",
    # Semantic response caching
    "CachedResponse",
    "Embedder",
    "SemanticCache",
    "SemanticCacheOptions",
    "is_streaming_request_body",
    "prompt_text_from_request_body",
    # Prometheus
    "prometheus_text",
    # Provider chain
    "ProviderChain",
    "ProviderEntry",
    "budget_provider_chain",
    "default_provider_chain",
    "quality_provider_chain",
]
