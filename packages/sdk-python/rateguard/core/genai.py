"""
GenAI OpenTelemetry observability — matching Go SDK implementation.

Emits gen_ai.* spans for every LLM call passing through RateGuard.
Token counting, cost estimation (14 models priced, verified), streaming chunk telemetry.

OpenTelemetry GenAI semantic conventions v1.29.0 (2026)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass
class GenAICall:
    model: str                                        # e.g. "gpt-4o"
    provider: str                                     # e.g. "openai"
    operation: Literal["chat", "text_completion", "embedding"] = "chat"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    streaming: bool = False
    stream_chunks: int = 0
    time_to_first_chunk_ms: int = 0    # TTFT — time to first token/chunk
    time_per_output_chunk_ms: float = 0.0  # TPOT — avg time per output chunk
    conversation_id: str = ""          # OTel gen_ai.conversation.id
    response_id: str = ""              # OTel gen_ai.response.id
    estimated_cost_usd: float = 0.0
    rate_limit_applied: bool = False
    token_budget_applied: bool = False
    token_budget_remaining: int = 0
    circuit_breaker_state: str = "closed"


# ── Model pricing (2026 market rates, USD per 1K tokens) ──

_MODEL_PRICING_2026: dict[str, dict[str, float]] = {
    # OpenAI
    "gpt-4o":              {"prompt": 0.0025,  "completion": 0.010},
    "gpt-4o-mini":         {"prompt": 0.00015, "completion": 0.0006},
    "gpt-4.1":             {"prompt": 0.002,   "completion": 0.008},
    "gpt-4.1-mini":        {"prompt": 0.0001,  "completion": 0.0004},
    "o3":                  {"prompt": 0.002,   "completion": 0.008},
    "o4-mini":             {"prompt": 0.0011,  "completion": 0.0044},
    # Anthropic
    "claude-opus-4-5":     {"prompt": 0.005,   "completion": 0.025},
    "claude-sonnet-4":     {"prompt": 0.003,   "completion": 0.015},
    "claude-haiku-3.5":    {"prompt": 0.0008,  "completion": 0.004},
    # Google
    "gemini-2.5-pro":      {"prompt": 0.00125, "completion": 0.010},
    "gemini-2.5-flash":    {"prompt": 0.000075,"completion": 0.0003},
    # Open source / hosted
    "llama-3.3-70b":       {"prompt": 0.00059, "completion": 0.00079},
    "deepseek-v3":         {"prompt": 0.00027, "completion": 0.0011},
    "deepseek-r1":         {"prompt": 0.00055, "completion": 0.00219},
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost for an LLM call based on 2026 market rates."""
    pricing = _MODEL_PRICING_2026.get(model)
    if not pricing:
        return 0.0  # unknown model — don't fabricate costs
    return (prompt_tokens / 1000) * pricing["prompt"] + (completion_tokens / 1000) * pricing["completion"]


def priced_models() -> list[str]:
    """Return all priced model names."""
    return list(_MODEL_PRICING_2026.keys())


# ── OpenTelemetry attribute builders ──

def genai_span_name(call: GenAICall) -> str:
    """Span name per OTel GenAI semantic conventions: "{operation} {model}"."""
    operation = call.operation or "chat"
    return f"{operation} {call.model}" if call.model else operation


def classify_error_type(error: Exception) -> str:
    """Map an error to a low-cardinality error.type per OTel semantic conventions.

    Full messages are high-cardinality and break error filtering in backends.
    """
    return type(error).__name__


def genai_span_attributes(call: GenAICall) -> dict[str, str | int | bool]:
    """Build OTel attributes for GenAI span start."""
    result: dict[str, str | int | bool] = {
        "gen_ai.provider.name": call.provider,
        "gen_ai.request.model": call.model,
        "gen_ai.operation.name": call.operation or "chat",
        "rateguard.request.is_stream": call.streaming,
        "rateguard.rate_limit.applied": call.rate_limit_applied,
        "rateguard.token_budget.applied": call.token_budget_applied,
        "rateguard.circuit_breaker.state": call.circuit_breaker_state,
    }
    if call.conversation_id:
        result["gen_ai.conversation.id"] = call.conversation_id
    return result


def genai_span_end_attributes(call: GenAICall, latency_seconds: float, error: Exception | None = None) -> dict[str, str | int | bool | float]:
    """Build OTel attributes for GenAI span end (with token counts).

    If error is provided, adds error.type per OTel semantic conventions.
    """
    attrs: dict[str, str | int | bool | float] = {
        "gen_ai.usage.input_tokens": call.prompt_tokens,
        "gen_ai.usage.output_tokens": call.completion_tokens,
        "rateguard.usage.total_tokens": call.total_tokens,
        "rateguard.usage.cost_usd": call.estimated_cost_usd,
        "rateguard.request.is_stream": call.streaming,
    }
    if call.streaming:
        attrs["rateguard.stream.chunks"] = call.stream_chunks
    if call.streaming and call.time_to_first_chunk_ms > 0:
        attrs["gen_ai.client.operation.time_to_first_chunk"] = call.time_to_first_chunk_ms
    if call.streaming and call.time_per_output_chunk_ms > 0:
        attrs["gen_ai.client.operation.time_per_output_chunk"] = call.time_per_output_chunk_ms
    if call.token_budget_applied:
        attrs["rateguard.token_budget.remaining"] = call.token_budget_remaining
    if error is not None:
        attrs["error.type"] = classify_error_type(error)
    if call.response_id:
        attrs["gen_ai.response.id"] = call.response_id
    return attrs
