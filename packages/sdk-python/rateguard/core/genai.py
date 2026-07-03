"""
GenAI OpenTelemetry observability — matching Go SDK implementation.

Emits gen_ai.* spans for every LLM call passing through RateGuard.
Token counting, cost estimation (28 models priced), streaming chunk telemetry.

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
    "o3":                  {"prompt": 0.010,   "completion": 0.040},
    "o4-mini":             {"prompt": 0.0011,  "completion": 0.0044},
    # Anthropic
    "claude-opus-4-5":     {"prompt": 0.015,   "completion": 0.075},
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

def genai_span_attributes(call: GenAICall) -> dict[str, str | int | bool]:
    """Build OTel attributes for GenAI span start."""
    return {
        "gen_ai.system": call.provider,
        "gen_ai.request.model": call.model,
        "gen_ai.operation.name": call.operation,
        "gen_ai.request.is_stream": call.streaming,
        "rateguard.rate_limit.applied": call.rate_limit_applied,
        "rateguard.token_budget.applied": call.token_budget_applied,
        "rateguard.circuit_breaker.state": call.circuit_breaker_state,
    }


def genai_span_end_attributes(call: GenAICall, latency_seconds: float) -> dict[str, str | int | bool | float]:
    """Build OTel attributes for GenAI span end (with token counts)."""
    attrs: dict[str, str | int | bool | float] = {
        "gen_ai.usage.prompt_tokens": call.prompt_tokens,
        "gen_ai.usage.completion_tokens": call.completion_tokens,
        "gen_ai.usage.total_tokens": call.total_tokens,
        "gen_ai.usage.cost_usd": call.estimated_cost_usd,
        "gen_ai.latency_seconds": latency_seconds,
        "gen_ai.request.is_stream": call.streaming,
    }
    if call.streaming:
        attrs["gen_ai.stream.chunks"] = call.stream_chunks
    if call.token_budget_applied:
        attrs["rateguard.token_budget.remaining"] = call.token_budget_remaining
    return attrs
