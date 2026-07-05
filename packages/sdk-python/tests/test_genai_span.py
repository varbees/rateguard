"""Public GenAI observability API — mirrors Go's genai_observability.go
GenAISpan/StartGenAICall tests."""

from __future__ import annotations

from rateguard import GenAICall, RateGuard
from rateguard.core.genai import estimate_cost, start_genai_call

from .helpers import FixedClock


def test_start_genai_call_records_start_time_and_merges_final():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai", operation="chat"))

    clock.advance(250)
    span.end(GenAICall(model="gpt-4o", provider="openai", prompt_tokens=100, completion_tokens=50))

    assert span.call.model == "gpt-4o"
    assert span.call.provider == "openai"
    assert span.call.prompt_tokens == 100
    assert span.call.completion_tokens == 50
    assert span.call.total_tokens == 150  # computed: prompt + completion


def test_genai_span_end_falls_back_to_estimate_cost_when_not_given():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai"))

    span.end(GenAICall(model="gpt-4o", provider="openai", prompt_tokens=1000, completion_tokens=1000))

    expected = estimate_cost("gpt-4o", 1000, 1000)
    assert expected > 0
    assert span.call.estimated_cost_usd == expected


def test_genai_span_end_respects_explicit_cost_over_estimate():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai"))

    span.end(GenAICall(model="gpt-4o", provider="openai", prompt_tokens=1000, completion_tokens=1000, estimated_cost_usd=9.99))

    assert span.call.estimated_cost_usd == 9.99


def test_genai_span_end_unknown_model_cost_is_zero_not_fabricated():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="totally-unknown-model", provider="acme"))

    span.end(GenAICall(model="totally-unknown-model", provider="acme", prompt_tokens=500, completion_tokens=500))

    assert span.call.estimated_cost_usd == 0.0


def test_genai_span_computes_ttft_and_tpot_from_recorded_chunks():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai"))

    clock.advance(50)
    span.record_chunk()  # first chunk at t=50ms -> TTFT=50
    clock.advance(30)
    span.record_chunk()
    clock.advance(20)
    span.record_chunk()  # 3 chunks total, ends at t=100ms

    span.end(GenAICall(model="gpt-4o", provider="openai", prompt_tokens=10, completion_tokens=20))

    assert span.call.streaming is True
    assert span.call.stream_chunks == 3
    assert span.call.time_to_first_chunk_ms == 50
    assert span.call.time_per_output_chunk_ms == 100 / 3


def test_genai_span_final_stream_fields_win_over_computed():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai"))

    clock.advance(10)
    span.record_chunk()
    clock.advance(10)
    span.record_chunk()

    span.end(GenAICall(
        model="gpt-4o", provider="openai",
        stream_chunks=999, time_to_first_chunk_ms=12345, time_per_output_chunk_ms=6789.0,
    ))

    assert span.call.stream_chunks == 999
    assert span.call.time_to_first_chunk_ms == 12345
    assert span.call.time_per_output_chunk_ms == 6789.0


def test_genai_span_no_chunks_means_not_streaming():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai"))
    span.end(GenAICall(model="gpt-4o", provider="openai", prompt_tokens=10, completion_tokens=10))

    assert span.call.streaming is False
    assert span.call.stream_chunks == 0
    assert span.call.time_to_first_chunk_ms == 0


def test_genai_span_end_attributes_reflect_merged_call():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai"))
    clock.advance(500)
    span.end(GenAICall(model="gpt-4o", provider="openai", prompt_tokens=10, completion_tokens=5))

    assert span.end_attributes is not None
    assert span.end_attributes["gen_ai.usage.input_tokens"] == 10
    assert span.end_attributes["gen_ai.usage.output_tokens"] == 5
    assert span.end_attributes["rateguard.usage.total_tokens"] == 15


def test_genai_span_end_records_error_type():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai"))
    span.end(GenAICall(model="gpt-4o", provider="openai"), error=ValueError("boom"))

    assert span.end_attributes["error.type"] == "ValueError"


def test_genai_span_end_none_final_falls_back_entirely_to_start_call():
    clock = FixedClock()
    span = start_genai_call(_FakeRuntime(clock), GenAICall(model="gpt-4o", provider="openai", prompt_tokens=7, completion_tokens=3))
    span.end()

    assert span.call.model == "gpt-4o"
    assert span.call.prompt_tokens == 7
    assert span.call.completion_tokens == 3
    assert span.call.total_tokens == 10


def test_rateguard_facade_exposes_start_genai_call():
    rg = RateGuard(preset="dev")
    span = rg.start_genai_call(GenAICall(model="gpt-4o", provider="openai", operation="chat"))
    span.record_chunk()
    span.end(GenAICall(model="gpt-4o", provider="openai", prompt_tokens=1, completion_tokens=1))

    assert span.call.total_tokens == 2
    assert span.call.streaming is True


class _FakeRuntime:
    """Minimal runtime stand-in exposing only what start_genai_call needs
    (config.clock) — avoids constructing a full RateGuardRuntime just to
    unit-test span timing math against a controllable FixedClock."""

    def __init__(self, clock: FixedClock) -> None:
        self.config = _FakeConfig(clock)


class _FakeConfig:
    def __init__(self, clock: FixedClock) -> None:
        self.clock = clock
