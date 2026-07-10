"""Pipecat adapter — session budgets inside a voice pipeline.

Research verdict this implements: production voice runs through
frameworks like Pipecat that terminate media server-side, so enforcement
belongs INSIDE the pipeline, not on a raw provider socket. This
processor sits anywhere in a Pipecat pipeline, watches the LLM usage
metrics Pipecat itself emits (``MetricsFrame`` → ``LLMUsageMetricsData``,
one per LLM inference), feeds them to a ``RealtimeSessionGuard``, and —
on breach — acts.

Every frame passes through UNCHANGED (transport transparency); this
processor only reads.

Enforcement actions on first breach, in order:
1. ``on_exceeded(decision)`` callback, if provided — your hook to say
   goodbye politely, log, or emit a receipt.
2. When ``fatal_on_exceeded`` is True (default), a FATAL ErrorFrame is
   pushed upstream — Pipecat's own sanctioned in-pipeline stop: the
   PipelineTask cancels and the session ends. Set it False to observe
   without stopping.

Verified against pipecat-ai 1.5.0 (MetricsFrame.data, LLMUsageMetricsData
.value: LLMTokenUsage, FrameProcessor.push_error(fatal=True)).
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable

try:
    from pipecat.frames.frames import Frame, MetricsFrame  # type: ignore[import-not-found]
    from pipecat.metrics.metrics import LLMUsageMetricsData  # type: ignore[import-not-found]
    from pipecat.processors.frame_processor import (  # type: ignore[import-not-found]
        FrameDirection,
        FrameProcessor,
    )
except ImportError as _exc:  # pragma: no cover — exercised only without pipecat
    raise ImportError(
        "rateguard.integrations.pipecat_adapter requires pipecat-ai: pip install pipecat-ai"
    ) from _exc

from ..core.realtime import RealtimeDecision, RealtimeEvent, RealtimeSessionGuard, RealtimeUsage


def usage_from_pipecat(value: Any) -> RealtimeUsage:
    """Map Pipecat's LLMTokenUsage onto RealtimeUsage. Pipecat reports
    prompt/completion aggregates (no audio/text modality split at this
    layer); cache reads map to cached input, reasoning to thoughts."""
    prompt = int(getattr(value, "prompt_tokens", 0) or 0)
    completion = int(getattr(value, "completion_tokens", 0) or 0)
    total = int(getattr(value, "total_tokens", 0) or 0)
    if total == 0:
        total = prompt + completion
    return RealtimeUsage(
        input_tokens=prompt,
        output_tokens=completion,
        total_tokens=total,
        input_cached_tokens=int(getattr(value, "cache_read_input_tokens", 0) or 0),
        thoughts_tokens=int(getattr(value, "reasoning_tokens", 0) or 0),
    )


class RateGuardBudgetProcessor(FrameProcessor):  # type: ignore[misc]
    """Drop-in Pipecat processor enforcing a session budget.

    Usage::

        guard = RealtimeSessionGuard("openai", RealtimeSessionGuardOptions(
            limits=RealtimeSessionLimits(max_total_tokens=200_000,
                                         max_duration_seconds=1800)))
        pipeline = Pipeline([transport.input(), stt, llm,
                             RateGuardBudgetProcessor(guard),
                             tts, transport.output()])
    """

    def __init__(
        self,
        guard: RealtimeSessionGuard,
        *,
        fatal_on_exceeded: bool = True,
        on_exceeded: Callable[[RealtimeDecision], Awaitable[None] | None] | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._guard = guard
        self._fatal_on_exceeded = fatal_on_exceeded
        self._on_exceeded = on_exceeded
        self._acted = False

    @property
    def guard(self) -> RealtimeSessionGuard:
        return self._guard

    async def process_frame(self, frame: "Frame", direction: "FrameDirection") -> None:
        await super().process_frame(frame, direction)

        decision: RealtimeDecision | None = None
        if isinstance(frame, MetricsFrame):
            for item in getattr(frame, "data", None) or []:
                if isinstance(item, LLMUsageMetricsData):
                    decision = self._guard.observe_event(
                        RealtimeEvent(
                            provider="openai",  # schema label only; usage is already parsed
                            type="pipecat.llm_usage",
                            usage=usage_from_pipecat(item.value),
                            turn_complete=True,  # one usage metric = one LLM inference
                        )
                    )
        else:
            # Non-metrics frames still advance the clock, so a duration
            # breach on a chatty-but-usage-quiet session is caught.
            decision = self._guard.tick()

        # Always pass the frame along untouched.
        await self.push_frame(frame, direction)

        if decision is not None and decision.exceeded and not self._acted:
            self._acted = True
            if self._on_exceeded is not None:
                result = self._on_exceeded(decision)
                if result is not None:  # awaitable callback
                    await result
            if self._fatal_on_exceeded:
                await self.push_error(
                    f"RateGuard session budget exceeded ({decision.reason}): "
                    f"tokens={decision.totals.total_tokens} turns={decision.turns} "
                    f"cost_micro_usd={decision.estimated_cost_micro_usd} "
                    f"elapsed={decision.elapsed_seconds:.0f}s",
                    fatal=True,
                )
