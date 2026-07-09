"""RateGuard Python middleware SDK."""

__version__ = "0.2.0"

from .adapters.asgi import RateGuardMiddleware as ASGIRateGuardMiddleware
from .adapters.decorators import rate_limited, token_budget
from .adapters.wsgi import RateGuardMiddleware as WSGIRateGuardMiddleware
from .config import known_presets, normalize_preset, normalize_token_budget_mode, preset_policy, resolve_rateguard_options
from .core.adaptive import AdaptiveLimiter, AdaptiveOptions
from .core.admin import AdminApp
from .core.bounded_cache import BoundedCache
# budget_attestation itself imports `cryptography` lazily (inside the
# functions that sign/verify), so this top-level import keeps
# `import rateguard` zero-dependency; only CALLING attestation functions
# without the `attestation` extra installed raises ImportError.
from .core.budget_attestation import (
    BudgetBlock,
    BudgetGrant,
    BudgetToken,
    attest,
    new_root_budget_token,
    parse_budget_token,
    private_key_from_raw,
    private_key_to_raw,
    sign,
    signing_payload,
    verify_chain,
    verify_presentation,
)
from .core.circuit_breaker import CircuitBreaker
from .core.event_emitter import ConsoleEventEmitter, HTTPEventEmitter, WebSocketEventEmitter
from .core.genai import (
    GenAICall,
    GenAISpan,
    classify_error_type,
    estimate_cost,
    genai_span_attributes,
    genai_span_end_attributes,
    genai_span_name,
    priced_models,
    start_genai_call,
)
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
from .core.mcp_server import serve_mcp
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
from .core.redis_limiter import (
    AsyncRedisLimiterClient,
    AsyncRedisPyClient,
    RedisEvalError,
    RedisGCRALimiter,
    RedisLimiterClient,
    RedisPyClient,
    build_redis_gcra_tier,
)
from .core.semantic_cache import CachedResponse, Embedder, SemanticCache, SemanticCacheOptions, is_streaming_request_body, prompt_text_from_request_body
from .core.semantic_loop import SemanticLoopDecision, SemanticLoopDetector, SemanticLoopOptions
from .core.sharded_limiter import ShardedLimiter
from .core.static_embedder import StaticEmbedder
from .core.token_budget import TokenBudgetManager
from .exceptions import BudgetExceeded, RateGuardException
from .facade import RateGuard
from .runtime import RateGuardRuntime
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
    PreflightDecision,
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
    "RateGuardRuntime",
    "BoundedCache",
    "PreflightDecision",
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
    "classify_error_type",
    "estimate_cost",
    "genai_span_attributes",
    "genai_span_end_attributes",
    "genai_span_name",
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
    "serve_mcp",
    # Admin control-plane API (unauthenticated by design — bind privately)
    "AdminApp",
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
    # Static embeddings + semantic loop detection
    "StaticEmbedder",
    "SemanticLoopDecision",
    "SemanticLoopDetector",
    "SemanticLoopOptions",
    # Prometheus
    "prometheus_text",
    # Provider chain
    "ProviderChain",
    "ProviderEntry",
    "budget_provider_chain",
    "default_provider_chain",
    "quality_provider_chain",
    # Redis distributed limiter
    "AsyncRedisLimiterClient",
    "AsyncRedisPyClient",
    "RedisEvalError",
    "RedisGCRALimiter",
    "RedisLimiterClient",
    "RedisPyClient",
    "build_redis_gcra_tier",
    # Budget attestation (Ed25519 delegation chains; needs the
    # `attestation` extra at call time)
    "BudgetBlock",
    "BudgetGrant",
    "BudgetToken",
    "attest",
    "new_root_budget_token",
    "parse_budget_token",
    "private_key_from_raw",
    "private_key_to_raw",
    "sign",
    "signing_payload",
    "verify_chain",
    "verify_presentation",
]
