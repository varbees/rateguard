"""
GenAI OpenTelemetry observability — matching Go SDK implementation.

Emits gen_ai.* spans for every LLM call passing through RateGuard.
Token counting, cost estimation (built-in table generated from conformance/pricing.json,
every row dated and sourced), streaming chunk telemetry.

OpenTelemetry GenAI semantic conventions v1.29.0 (2026)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Literal, Protocol
from .pricing_table import BUILTIN_PRICING, BUILTIN_PRICING_REVIEWED  # noqa: F401  (re-exported)
from ..types import TokenUsage

if TYPE_CHECKING:
    from ..runtime import RateGuardRuntime
    from ..types import Clock


@dataclass
class GenAICall:
    model: str                                        # e.g. "gpt-4o"
    provider: str                                     # e.g. "openai"
    operation: Literal["chat", "text_completion", "embedding"] = "chat"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0  # prompt_tokens is the whole prompt, cached parts included
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
    # Prompt-cache breakdown, subsets of prompt_tokens (see TokenUsage). They
    # price cache hits and writes at their own rates.
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cache_write_long_ttl_tokens: int = 0


# ── Model pricing ──
# The built-in table is generated from conformance/pricing.json by
# scripts/gen_pricing.py, identically for all three SDKs. Do not hand-edit it.


@dataclass(slots=True)
class ModelPrice:
    """USD cost per 1,000 tokens for one model, prompt and completion.

    The cache rates are optional: 0 means unset, and cache reads and writes
    then bill at prompt_usd_per_1k, long-TTL writes at the cache-write rate."""

    prompt_usd_per_1k: float
    completion_usd_per_1k: float
    cache_read_usd_per_1k: float = 0.0
    # Default-TTL cache writes (Anthropic 5m, OpenAI 30m).
    cache_write_usd_per_1k: float = 0.0
    # Long-TTL cache writes (Anthropic 1h, OpenAI 12h).
    cache_write_long_ttl_usd_per_1k: float = 0.0


class PricingProvider(Protocol):
    """Resolves a per-1K-token price for a model. Return None to fall through
    to the built-in starter table (then to zero — costs are never fabricated).
    Same optional-interface pattern as the embedder/event-emitter hooks; bring
    your own, or use StaticPricing. Costs are observability estimates only —
    they never drive enforcement (the token budget is token-count based)."""

    def price_for(self, model: str) -> ModelPrice | None: ...


class StaticPricing:
    """A PricingProvider backed by a caller-owned map — the answer to "the
    model I use isn't in your table." Register base names; a dated snapshot the
    provider reports back ("gpt-4o-2024-08-06") resolves via normalization."""

    def __init__(self, prices: dict[str, ModelPrice]) -> None:
        self._prices = prices

    def price_for(self, model: str) -> ModelPrice | None:
        price = self._prices.get(model)
        if price is not None:
            return price
        return self._prices.get(normalize_model_id(model))


# Trailing date/preview noise a provider appends to a base model ID. A bare
# "-N" (a minor version like "claude-sonnet-4-5") is intentionally NOT stripped.
_ISO_DATE = re.compile(r"-\d{4}-\d{2}-\d{2}$")  # OpenAI: -2024-08-06
_COMPACT_DATE = re.compile(r"-\d{8}$")  # Anthropic: -20250929
_MONTH_YEAR = re.compile(r"-\d{2}-\d{4}$")  # Gemini: -09-2025


def normalize_model_id(model: str) -> str:
    """Lower-cases a model name and strips trailing date/preview suffixes so a
    provider-reported snapshot ID matches a base pricing key. Conservative: it
    removes only recognizable date shapes and -preview/-latest/-exp aliases,
    never meaningful words (mini, nano, lite, pro) or minor-version digits."""
    m = model.strip().lower()
    while True:
        orig = m
        m = _ISO_DATE.sub("", m)
        m = _COMPACT_DATE.sub("", m)
        m = _MONTH_YEAR.sub("", m)
        for suffix in ("-preview", "-latest", "-exp"):
            if m.endswith(suffix):
                m = m[: -len(suffix)]
        if m == orig:
            return m


def _builtin_price_for(model: str, prompt_tokens: int = 0) -> ModelPrice | None:
    """The rate a request with ``prompt_tokens`` of input is billed at: the
    vendor's long-context rate when the prompt is past its threshold (applied
    to the whole request, as the vendors bill it), the base rate otherwise."""
    p = BUILTIN_PRICING.get(model) or BUILTIN_PRICING.get(normalize_model_id(model))
    if p is None:
        return None
    (prompt, completion, read, write, write_long,
     long_above, long_prompt, long_completion, long_read, long_write, long_write_long) = p
    if long_above > 0 and prompt_tokens > long_above:
        return ModelPrice(long_prompt, long_completion, long_read, long_write, long_write_long)
    return ModelPrice(prompt, completion, read, write, write_long)


def estimate_cost_with(
    pricing: PricingProvider | None,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    """Price a call with no cache breakdown (every prompt token at the input
    rate): caller's PricingProvider first, then the built-in starter table
    (normalized), then zero. Never fabricates a cost."""
    return estimate_usage_cost_with(
        pricing, model, TokenUsage(input_tokens=prompt_tokens, output_tokens=completion_tokens)
    )


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost from the built-in starter table (model-ID normalized,
    so a dated snapshot matches its base entry), every prompt token at the
    input rate. Unknown models return zero. For a call with prompt caching use
    estimate_usage_cost. For custom/not-yet-tabled models, supply a
    PricingProvider (StaticPricing)."""
    return estimate_cost_with(None, model, prompt_tokens, completion_tokens)


def estimate_usage_cost(model: str, usage: TokenUsage) -> float:
    """Price a normalised TokenUsage from the built-in table, cache reads and
    writes at their own rates::

        fresh = input_tokens - cache_read_tokens - cache_write_tokens
        cost  = fresh*input + cache_read_tokens*cache_read
              + (cache_write_tokens - cache_write_long_ttl_tokens)*cache_write
              + cache_write_long_ttl_tokens*cache_write_long_ttl
              + output_tokens*output

    The long-context tier is chosen on input_tokens, the whole prompt (cache
    reads and writes count toward prompt length at every vendor). Same formula
    as Go's EstimateUsageCost."""
    return estimate_usage_cost_with(None, model, usage)


def estimate_usage_cost_with(pricing: PricingProvider | None, model: str, usage: TokenUsage) -> float:
    """estimate_usage_cost with a caller PricingProvider tried first."""
    price: ModelPrice | None = None
    if pricing is not None:
        price = pricing.price_for(model)
    if price is None:
        price = _builtin_price_for(model, usage.input_tokens)
    if price is None:
        return 0.0
    read = max(usage.cache_read_tokens, 0)
    write = max(usage.cache_write_tokens, 0)
    write_long = min(max(usage.cache_write_long_ttl_tokens, 0), write)
    fresh = max(usage.input_tokens - read - write, 0)
    read_rate = _or_rate(price.cache_read_usd_per_1k, price.prompt_usd_per_1k)
    write_rate = _or_rate(price.cache_write_usd_per_1k, price.prompt_usd_per_1k)
    write_long_rate = _or_rate(price.cache_write_long_ttl_usd_per_1k, write_rate)
    return (
        (fresh / 1000) * price.prompt_usd_per_1k
        + (read / 1000) * read_rate
        + ((write - write_long) / 1000) * write_rate
        + (write_long / 1000) * write_long_rate
        + (usage.output_tokens / 1000) * price.completion_usd_per_1k
    )


def _or_rate(rate: float, fallback: float) -> float:
    return rate if rate > 0 else fallback


def priced_models() -> list[str]:
    """Return all priced model names."""
    return sorted(BUILTIN_PRICING)


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
    if call.cache_read_tokens > 0:
        attrs["gen_ai.usage.cache_read.input_tokens"] = call.cache_read_tokens
    if call.cache_write_tokens > 0:
        attrs["gen_ai.usage.cache_creation.input_tokens"] = call.cache_write_tokens
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


# ── Public GenAI tracking API ──
#
# genai_span_attributes/genai_span_end_attributes above are pure OTel
# attribute builders — RateGuard's Python SDK ships no OpenTelemetry SDK
# integration of its own (unlike Go's genai_observability.go, which wires
# them into a real otel tracer/meter when one is configured). GenAISpan is
# the same stateful facade Go's SDK.StartGenAICall/GenAISpan provide —
# start a span per LLM call, record streaming chunks as they arrive, and
# call end() with whatever the response told you — except its output is
# the computed GenAICall plus the OTel-shaped end attributes dict, ready
# for a caller with their own tracer to emit onto a real span.


def _merge_genai_call(start_call: GenAICall, final: GenAICall | None) -> GenAICall:
    """Merges final over the fields captured at start: non-zero/non-empty
    fields in final win, everything else falls back to the value recorded
    at start_genai_call time. Mirrors Go's GenAISpan.End field-by-field
    (only the fields Go's End() actually touches — Model, Provider,
    Operation, token counts, EstimatedCostUSD, ResponseID; fields like
    ConversationID or CircuitBreakerState are start-time only, exactly as
    in Go)."""
    call = replace(start_call)
    if final is None:
        return call
    if final.model:
        call.model = final.model
    if final.provider:
        call.provider = final.provider
    if final.operation:
        call.operation = final.operation
    if final.prompt_tokens > 0:
        call.prompt_tokens = final.prompt_tokens
    if final.completion_tokens > 0:
        call.completion_tokens = final.completion_tokens
    if final.total_tokens > 0:
        call.total_tokens = final.total_tokens
    if final.cache_read_tokens > 0:
        call.cache_read_tokens = final.cache_read_tokens
    if final.cache_write_tokens > 0:
        call.cache_write_tokens = final.cache_write_tokens
    if final.cache_write_long_ttl_tokens > 0:
        call.cache_write_long_ttl_tokens = final.cache_write_long_ttl_tokens
    if final.estimated_cost_usd > 0:
        call.estimated_cost_usd = final.estimated_cost_usd
    if final.response_id:
        call.response_id = final.response_id
    return call


class GenAISpan:
    """Tracks one in-flight LLM call started with start_genai_call.
    Mirrors Go's GenAISpan (genai_observability.go lines ~319-425).

        span = rg.start_genai_call(GenAICall(model="gpt-4o", provider="openai", operation="chat"))
        try:
            for chunk in stream:
                span.record_chunk()
                ...
        except Exception as exc:
            span.end(GenAICall(model="", provider=""), error=exc)
        else:
            span.end(GenAICall(model="gpt-4o", provider="openai",
                                prompt_tokens=usage.input, completion_tokens=usage.output))

    After end(), `.call` holds the fully merged GenAICall and
    `.end_attributes` holds the OTel-shaped attributes dict from
    genai_span_end_attributes — feed those onto your own tracer's span if
    you have one.
    """

    def __init__(self, call: GenAICall, clock: "Clock", pricing: "PricingProvider | None" = None) -> None:
        self._clock = clock
        self._start_call = call
        self._pricing = pricing
        self._start = clock.now()  # ms, per this codebase's Clock convention
        self._first_chunk_at: float | None = None
        self._chunks = 0
        self.call: GenAICall = call
        self.end_attributes: dict[str, str | int | bool | float] | None = None

    def record_chunk(self) -> None:
        """Marks a streaming chunk. The first call sets time-to-first-chunk."""
        self._chunks += 1
        if self._first_chunk_at is None:
            self._first_chunk_at = self._clock.now()

    def end(self, final: GenAICall | None = None, error: Exception | None = None) -> None:
        """Completes the span with final usage. Zero-value/empty fields in
        final fall back to the values passed at start_genai_call. Cost is
        estimated automatically from the pricing table when not provided."""
        call = _merge_genai_call(self._start_call, final)

        if call.total_tokens == 0:
            call.total_tokens = call.prompt_tokens + call.completion_tokens
        if call.estimated_cost_usd == 0:
            call.estimated_cost_usd = estimate_usage_cost_with(
                self._pricing,
                call.model,
                TokenUsage(
                    input_tokens=call.prompt_tokens,
                    output_tokens=call.completion_tokens,
                    cache_read_tokens=call.cache_read_tokens,
                    cache_write_tokens=call.cache_write_tokens,
                    cache_write_long_ttl_tokens=call.cache_write_long_ttl_tokens,
                ),
            )

        latency_ms = max(0.0, self._clock.now() - self._start)
        if self._chunks > 0:
            call.streaming = True
            call.stream_chunks = self._chunks
            if self._first_chunk_at is not None:
                call.time_to_first_chunk_ms = int(self._first_chunk_at - self._start)
            call.time_per_output_chunk_ms = latency_ms / self._chunks
        # final's own stream fields win over computed ones if explicitly
        # provided — same order Go's End() applies them in.
        if final is not None:
            if final.stream_chunks > 0:
                call.stream_chunks = final.stream_chunks
            if final.time_to_first_chunk_ms > 0:
                call.time_to_first_chunk_ms = final.time_to_first_chunk_ms
            if final.time_per_output_chunk_ms > 0:
                call.time_per_output_chunk_ms = final.time_per_output_chunk_ms

        self.call = call
        self.end_attributes = genai_span_end_attributes(call, latency_ms / 1000.0, error)


def start_genai_call(runtime: "RateGuardRuntime", call: GenAICall) -> GenAISpan:
    """Opens a GenAI call span, recording the start time via runtime's
    Clock. Thin entry point wired onto RateGuard.start_genai_call in
    facade.py — mirrors Go's SDK.StartGenAICall."""
    return GenAISpan(call, runtime.config.clock, runtime.config.pricing_provider)
