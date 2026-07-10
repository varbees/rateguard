"""Realtime session enforcement — mirrors Go's realtime_session_test.go.
Conformance cases include REAL Gemini Live frames captured from the live
API (2026-07-10)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from rateguard import (
    RealtimeCostRates,
    RealtimeEvent,
    RealtimeSessionGuard,
    RealtimeSessionGuardOptions,
    RealtimeSessionLimits,
    RealtimeUsage,
    parse_realtime_event,
)

VECTORS = Path(__file__).resolve().parents[3] / "conformance" / "realtime_usage_vectors.json"


def load_vectors() -> dict:
    return json.loads(VECTORS.read_text())


def test_realtime_usage_conformance() -> None:
    vectors = load_vectors()
    assert vectors["cases"], "no vector cases"
    for case in vectors["cases"]:
        ev = parse_realtime_event(case["provider"], json.dumps(case["event"]))
        expect = case["expect"]
        assert ev.type == expect["type"], case["name"]
        assert ev.turn_complete == expect["turn_complete"], case["name"]
        assert (ev.usage is not None) == expect["has_usage"], case["name"]
        if expect.get("usage"):
            want = expect["usage"]
            assert ev.usage is not None
            for field_name, value in want.items():
                assert getattr(ev.usage, field_name) == value, f"{case['name']}: {field_name}"


def usage_event(total: int = 0, in_audio: int = 0, out_audio: int = 0, turn_complete: bool = True) -> RealtimeEvent:
    return RealtimeEvent(
        provider="openai",
        type="response.done",
        turn_complete=turn_complete,
        usage=RealtimeUsage(total_tokens=total, input_audio_tokens=in_audio, output_audio_tokens=out_audio),
    )


def test_guard_sums_usage_and_trips_on_total_tokens() -> None:
    fired: list = []
    g = RealtimeSessionGuard(
        "openai",
        RealtimeSessionGuardOptions(
            limits=RealtimeSessionLimits(max_total_tokens=1000),
            on_exceeded=fired.append,
        ),
    )
    d = g.observe_event(usage_event(total=400))
    assert not d.exceeded and d.totals.total_tokens == 400 and d.turns == 1
    d = g.observe_event(usage_event(total=400))
    assert not d.exceeded  # 800 <= 1000
    d = g.observe_event(usage_event(total=400))
    assert d.exceeded and d.reason == "total_tokens" and d.totals.total_tokens == 1200
    assert len(fired) == 1

    # Terminal, no re-fire.
    d = g.observe_event(usage_event(total=1, turn_complete=False))
    assert d.exceeded
    assert len(fired) == 1


def test_guard_audio_token_limit() -> None:
    g = RealtimeSessionGuard("gemini", RealtimeSessionGuardOptions(limits=RealtimeSessionLimits(max_audio_tokens=100)))
    assert not g.observe_event(usage_event(in_audio=60, out_audio=30)).exceeded  # 90
    d = g.observe_event(usage_event(in_audio=6, out_audio=6))  # 102
    assert d.exceeded and d.reason == "audio_tokens"


def test_guard_cost_accounting_and_cached_split() -> None:
    rates = RealtimeCostRates(input_audio_per_m_tokens=32_000_000, output_audio_per_m_tokens=64_000_000)
    g = RealtimeSessionGuard(
        "openai",
        RealtimeSessionGuardOptions(
            limits=RealtimeSessionLimits(max_estimated_cost_micro_usd=100_000),
            cost_rates=rates,
        ),
    )
    d = g.observe_event(usage_event(in_audio=1000, out_audio=1000))
    assert not d.exceeded and d.estimated_cost_micro_usd == 96_000
    d = g.observe_event(usage_event(in_audio=200))
    assert d.exceeded and d.reason == "cost" and d.estimated_cost_micro_usd == 102_400

    # Cached-input split: 400 uncached × $4/M + 600 cached × $0.4/M = 1840 µ$.
    split = RealtimeCostRates(input_text_per_m_tokens=4_000_000, input_cached_per_m_tokens=400_000)
    g2 = RealtimeSessionGuard("openai", RealtimeSessionGuardOptions(cost_rates=split))
    d2 = g2.observe_event(
        RealtimeEvent(provider="openai", type="response.done", usage=RealtimeUsage(input_text_tokens=1000, input_cached_tokens=600))
    )
    assert d2.estimated_cost_micro_usd == 1_840


class FakeClock:
    def __init__(self, start: float) -> None:
        self.t = start

    def now(self) -> float:
        return self.t


def test_guard_duration_via_tick_and_peek_purity() -> None:
    clock = FakeClock(1_780_000_000.0)
    fired: list = []
    g = RealtimeSessionGuard(
        "openai",
        RealtimeSessionGuardOptions(
            limits=RealtimeSessionLimits(max_duration_seconds=60),
            on_exceeded=fired.append,
            clock=clock,
        ),
    )
    clock.t += 120

    p = g.peek()
    assert p.exceeded and p.reason == "duration"
    assert not fired, "peek fired on_exceeded — pre-flight must never mutate"
    assert g.peek().exceeded and not fired  # repeatable

    d = g.tick()
    assert d.exceeded and d.reason == "duration" and len(fired) == 1
    g.tick()
    assert len(fired) == 1  # no re-fire


def test_observe_raw_end_to_end_with_real_gemini_frame() -> None:
    vectors = load_vectors()
    frame = next(
        json.dumps(c["event"]) for c in vectors["cases"] if c["provider"] == "gemini" and c["expect"]["has_usage"]
    )
    g = RealtimeSessionGuard("gemini", RealtimeSessionGuardOptions(limits=RealtimeSessionLimits(max_total_tokens=500)))
    ev, d = g.observe_raw(frame)
    assert ev.usage is not None and d.totals.total_tokens == 393 and d.turns == 1 and not d.exceeded
    _, d = g.observe_raw(frame)
    assert d.exceeded and d.reason == "total_tokens" and d.totals.total_tokens == 786

    with pytest.raises(json.JSONDecodeError):
        g.observe_raw("not json")
