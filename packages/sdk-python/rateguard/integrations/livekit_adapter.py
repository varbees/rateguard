"""LiveKit Agents adapter — session budgets from metrics events.

Research verdict this implements: production voice runs through
frameworks like LiveKit Agents that terminate WebRTC media server-side;
the enforcement point is the agent session, not a raw provider socket.
LiveKit already emits per-inference metrics ("metrics_collected") for
both the LLM path (LLMMetrics) and the realtime path
(RealtimeModelMetrics, with audio/text/cached token details) — this
adapter feeds them to a RealtimeSessionGuard and hands you the breach.

Enforcement stance unchanged: the guard DECIDES, your callback ACTS
(``session.interrupt()``, ``await session.aclose()``, say goodbye first —
your call). The adapter never touches media.

Verified against livekit-agents 1.6.5 (AgentSession.on("metrics_collected"),
MetricsCollectedEvent.metrics, RealtimeModelMetrics.input_token_details
{audio,text,cached}, LLMMetrics.prompt/completion/total/prompt_cached).
"""

from __future__ import annotations

from typing import Any, Callable

try:
    from livekit.agents.metrics import (  # type: ignore[import-not-found]
        LLMMetrics,
        RealtimeModelMetrics,
    )
except ImportError as _exc:  # pragma: no cover — exercised only without livekit-agents
    raise ImportError(
        "rateguard.integrations.livekit_adapter requires livekit-agents: pip install livekit-agents"
    ) from _exc

from ..core.realtime import RealtimeDecision, RealtimeEvent, RealtimeSessionGuard, RealtimeUsage


def usage_from_livekit(m: Any) -> RealtimeUsage | None:
    """Map a LiveKit metrics object onto RealtimeUsage. Returns None for
    metric types that carry no token usage (STT/TTS/VAD/EOU)."""
    if isinstance(m, RealtimeModelMetrics):
        in_details = m.input_token_details
        out_details = m.output_token_details
        return RealtimeUsage(
            input_tokens=int(m.input_tokens),
            output_tokens=int(m.output_tokens),
            total_tokens=int(m.total_tokens),
            input_text_tokens=int(in_details.text_tokens),
            input_audio_tokens=int(in_details.audio_tokens),
            input_cached_tokens=int(in_details.cached_tokens),
            output_text_tokens=int(out_details.text_tokens),
            output_audio_tokens=int(out_details.audio_tokens),
        )
    if isinstance(m, LLMMetrics):
        total = int(m.total_tokens) or int(m.prompt_tokens) + int(m.completion_tokens)
        return RealtimeUsage(
            input_tokens=int(m.prompt_tokens),
            output_tokens=int(m.completion_tokens),
            total_tokens=total,
            input_cached_tokens=int(getattr(m, "prompt_cached_tokens", 0) or 0),
        )
    return None


def attach_rateguard(
    session: Any,
    guard: RealtimeSessionGuard,
    *,
    on_exceeded: Callable[[RealtimeDecision], None] | None = None,
) -> Callable[[Any], None]:
    """Subscribe a RealtimeSessionGuard to an AgentSession's metrics.

    Returns the registered handler so you can unsubscribe with
    ``session.off("metrics_collected", handler)``.

    Usage::

        guard = RealtimeSessionGuard("openai", RealtimeSessionGuardOptions(
            limits=RealtimeSessionLimits(max_estimated_cost_micro_usd=500_000),
            cost_rates=RealtimeCostRates(input_audio_per_m_tokens=32_000_000,
                                         output_audio_per_m_tokens=64_000_000)))

        def stop(decision):
            session.interrupt()  # or schedule session.aclose()

        attach_rateguard(session, guard, on_exceeded=stop)
    """
    acted = {"done": False}

    def _handler(event: Any) -> None:
        metrics_obj = getattr(event, "metrics", event)
        usage = usage_from_livekit(metrics_obj)
        if usage is None:
            decision = guard.tick()
        else:
            decision = guard.observe_event(
                RealtimeEvent(
                    provider="openai",  # schema label only; usage is already parsed
                    type=f"livekit.{getattr(metrics_obj, 'type', 'metrics')}",
                    usage=usage,
                    turn_complete=True,  # one metrics event = one inference/response
                )
            )
        if decision.exceeded and not acted["done"]:
            acted["done"] = True
            if on_exceeded is not None:
                on_exceeded(decision)

    session.on("metrics_collected", _handler)
    return _handler
