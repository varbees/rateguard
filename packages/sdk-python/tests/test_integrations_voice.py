"""Voice framework adapters (Pipecat, LiveKit Agents).

These tests exercise the adapters against the REAL framework packages —
they skip cleanly when the frameworks aren't installed (the core SDK
stays zero-dependency; CI without extras still passes). Run them for
real with an env that has pipecat-ai and livekit-agents installed.
"""

from __future__ import annotations

import pytest

from rateguard import (
    RealtimeDecision,
    RealtimeSessionGuard,
    RealtimeSessionGuardOptions,
    RealtimeSessionLimits,
)

# ── Pipecat ──

pipecat_frames = pytest.importorskip("pipecat.frames.frames", reason="pipecat-ai not installed")


def make_llm_metrics_frame(prompt: int, completion: int):
    from pipecat.frames.frames import MetricsFrame
    from pipecat.metrics.metrics import LLMTokenUsage, LLMUsageMetricsData

    usage = LLMTokenUsage(prompt_tokens=prompt, completion_tokens=completion, total_tokens=prompt + completion)
    return MetricsFrame(data=[LLMUsageMetricsData(processor="llm", model="gpt-4o", value=usage)])


def test_usage_from_pipecat_maps_real_token_usage() -> None:
    from pipecat.metrics.metrics import LLMTokenUsage

    from rateguard.integrations.pipecat_adapter import usage_from_pipecat

    u = usage_from_pipecat(
        LLMTokenUsage(
            prompt_tokens=100,
            completion_tokens=40,
            total_tokens=140,
            cache_read_input_tokens=25,
            reasoning_tokens=7,
        )
    )
    assert u.input_tokens == 100
    assert u.output_tokens == 40
    assert u.total_tokens == 140
    assert u.input_cached_tokens == 25
    assert u.thoughts_tokens == 7


async def test_pipecat_processor_observes_passes_through_and_acts(monkeypatch: pytest.MonkeyPatch) -> None:
    from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

    from rateguard.integrations.pipecat_adapter import RateGuardBudgetProcessor

    # Isolate the adapter from pipeline plumbing: base bookkeeping is a
    # no-op, pushes are recorded.
    async def _noop_base(self, frame, direction):  # noqa: ANN001
        return None

    monkeypatch.setattr(FrameProcessor, "process_frame", _noop_base)

    fired: list[RealtimeDecision] = []
    guard = RealtimeSessionGuard(
        "openai",
        RealtimeSessionGuardOptions(limits=RealtimeSessionLimits(max_total_tokens=250)),
    )
    proc = RateGuardBudgetProcessor(guard, on_exceeded=fired.append)

    pushed: list = []
    errors: list = []

    async def record_push(frame, direction=FrameDirection.DOWNSTREAM):  # noqa: ANN001
        pushed.append((frame, direction))

    async def record_error(error_msg, exception=None, fatal=False):  # noqa: ANN001
        errors.append((error_msg, fatal))

    monkeypatch.setattr(proc, "push_frame", record_push)
    monkeypatch.setattr(proc, "push_error", record_error)

    # Turn 1: 140 tokens — under budget, frame passes through untouched.
    frame1 = make_llm_metrics_frame(100, 40)
    await proc.process_frame(frame1, FrameDirection.DOWNSTREAM)
    assert pushed[-1][0] is frame1, "frame must pass through unchanged"
    assert not fired and not errors
    assert guard.peek().totals.total_tokens == 140

    # Turn 2: +140 = 280 > 250 — breach: callback once + fatal error frame.
    frame2 = make_llm_metrics_frame(100, 40)
    await proc.process_frame(frame2, FrameDirection.DOWNSTREAM)
    assert pushed[-1][0] is frame2, "frame passes through even on breach"
    assert len(fired) == 1 and fired[0].reason == "total_tokens"
    assert len(errors) == 1 and errors[0][1] is True, "breach pushes a FATAL error frame"

    # Turn 3: terminal — no duplicate actions.
    await proc.process_frame(make_llm_metrics_frame(1, 1), FrameDirection.DOWNSTREAM)
    assert len(fired) == 1 and len(errors) == 1


# ── LiveKit Agents ──

livekit_metrics = pytest.importorskip("livekit.agents.metrics", reason="livekit-agents not installed")


def test_usage_from_livekit_realtime_and_llm_metrics() -> None:
    from livekit.agents.metrics import LLMMetrics, RealtimeModelMetrics

    from rateguard.integrations.livekit_adapter import usage_from_livekit

    rtm = RealtimeModelMetrics(
        request_id="r1",
        timestamp=1.0,
        input_tokens=1000,
        output_tokens=240,
        total_tokens=1240,
        input_token_details=RealtimeModelMetrics.InputTokenDetails(
            audio_tokens=550, text_tokens=400, cached_tokens=50
        ),
        output_token_details=RealtimeModelMetrics.OutputTokenDetails(text_tokens=40, audio_tokens=200),
    )
    u = usage_from_livekit(rtm)
    assert u is not None
    assert (u.input_tokens, u.output_tokens, u.total_tokens) == (1000, 240, 1240)
    assert (u.input_audio_tokens, u.input_text_tokens, u.input_cached_tokens) == (550, 400, 50)
    assert (u.output_audio_tokens, u.output_text_tokens) == (200, 40)

    llm = LLMMetrics(
        type="llm_metrics",
        label="llm",
        request_id="r2",
        timestamp=2.0,
        duration=0.5,
        ttft=0.1,
        cancelled=False,
        completion_tokens=40,
        prompt_tokens=100,
        prompt_cached_tokens=10,
        total_tokens=140,
        tokens_per_second=80.0,
    )
    u2 = usage_from_livekit(llm)
    assert u2 is not None
    assert (u2.input_tokens, u2.output_tokens, u2.total_tokens, u2.input_cached_tokens) == (100, 40, 140, 10)


def test_attach_rateguard_feeds_guard_and_fires_once() -> None:
    from livekit.agents.metrics import RealtimeModelMetrics

    from rateguard.integrations.livekit_adapter import attach_rateguard

    class FakeSession:
        def __init__(self) -> None:
            self.handlers: dict[str, object] = {}

        def on(self, event: str, callback):  # noqa: ANN001
            self.handlers[event] = callback
            return callback

    class FakeEvent:
        def __init__(self, metrics) -> None:  # noqa: ANN001
            self.metrics = metrics

    def rtm(total: int) -> RealtimeModelMetrics:
        return RealtimeModelMetrics(
            request_id="x",
            timestamp=0.0,
            input_tokens=0,
            output_tokens=0,
            total_tokens=total,
            input_token_details=RealtimeModelMetrics.InputTokenDetails(),
            output_token_details=RealtimeModelMetrics.OutputTokenDetails(),
        )

    fired: list[RealtimeDecision] = []
    guard = RealtimeSessionGuard(
        "openai",
        RealtimeSessionGuardOptions(limits=RealtimeSessionLimits(max_total_tokens=500)),
    )
    session = FakeSession()
    handler = attach_rateguard(session, guard, on_exceeded=fired.append)
    assert session.handlers["metrics_collected"] is handler

    handler(FakeEvent(rtm(300)))
    assert not fired and guard.peek().totals.total_tokens == 300

    handler(FakeEvent(rtm(300)))  # 600 > 500
    assert len(fired) == 1 and fired[0].reason == "total_tokens"

    handler(FakeEvent(rtm(10)))  # terminal, no re-fire
    assert len(fired) == 1
