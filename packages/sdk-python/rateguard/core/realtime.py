"""Realtime session enforcement — the voice substrate.

Voice sessions (OpenAI Realtime, Gemini Live) are one WebSocket that can
burn dollars per minute for hours; request-based rate limiting is
structurally blind to them. This module extracts token usage from
realtime SERVER events and budgets a session continuously. It is the
substrate the Pipecat / LiveKit Agents adapters sit on.

Transport-agnostic by design: RateGuard never touches the socket. The
integrator feeds each inbound server frame (a copy — byte transparency
stays with the caller's loop) to the guard and acts on its decision.

Schema provenance, stated precisely because the two differ:
- Gemini Live: LIVE-VERIFIED 2026-07-10 against the real API
  (models/gemini-2.5-flash-native-audio-latest, free tier).
  usageMetadata arrives with the turn-completing message and is
  PER-TURN (verified with a two-turn session: counts do not
  accumulate), with modality-split detail arrays and thoughtsTokenCount.
- OpenAI Realtime: schema-validated against the documented server events
  (response.done carries response.usage); live verification pending —
  no free tier. These counts are estimates vs the billing meter.

Session semantics that follow: usage events are SUMMED per session for
both providers (per-response for OpenAI, per-turn for Gemini) — the
opposite of SSE usage inside one response (MAX-merge), because realtime
events each describe a disjoint slice of work.

Enforcement stance: the guard DECIDES, the integrator ACTS. On first
breach ``on_exceeded`` fires exactly once and the state is terminal —
close the socket with a proper close frame, degrade to text, or
downgrade the model. Frames are never rewritten.
"""

from __future__ import annotations

import json
import threading
import time as _time
from dataclasses import dataclass, field, replace
from typing import Any, Callable, Literal

from .. import types as _types

RealtimeProviderName = Literal["openai", "gemini"]


@dataclass(frozen=True)
class RealtimeUsage:
    """One usage observation. All fields are token counts; 0 = not reported."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    input_text_tokens: int = 0
    input_audio_tokens: int = 0
    input_cached_tokens: int = 0
    output_text_tokens: int = 0
    output_audio_tokens: int = 0
    thoughts_tokens: int = 0  # Gemini's thoughtsTokenCount

    def add(self, other: "RealtimeUsage") -> "RealtimeUsage":
        return RealtimeUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
            input_text_tokens=self.input_text_tokens + other.input_text_tokens,
            input_audio_tokens=self.input_audio_tokens + other.input_audio_tokens,
            input_cached_tokens=self.input_cached_tokens + other.input_cached_tokens,
            output_text_tokens=self.output_text_tokens + other.output_text_tokens,
            output_audio_tokens=self.output_audio_tokens + other.output_audio_tokens,
            thoughts_tokens=self.thoughts_tokens + other.thoughts_tokens,
        )


@dataclass(frozen=True)
class RealtimeEvent:
    """Parsed view of one server frame. usage is None when the event
    carries no usage report (most deltas)."""

    provider: RealtimeProviderName
    type: str
    usage: RealtimeUsage | None = None
    turn_complete: bool = False


def parse_openai_realtime_event(raw: bytes | str) -> RealtimeEvent:
    """One OpenAI Realtime server event. Usage rides "response.done"
    (one response = one model turn)."""
    data = json.loads(raw)
    event_type = str(data.get("type", "unknown"))
    out_usage: RealtimeUsage | None = None
    turn_complete = event_type == "response.done"
    if turn_complete:
        u = (data.get("response") or {}).get("usage")
        if u is not None:
            in_details = u.get("input_token_details") or {}
            out_details = u.get("output_token_details") or {}
            out_usage = RealtimeUsage(
                input_tokens=int(u.get("input_tokens", 0)),
                output_tokens=int(u.get("output_tokens", 0)),
                total_tokens=int(u.get("total_tokens", 0)),
                input_text_tokens=int(in_details.get("text_tokens", 0)),
                input_audio_tokens=int(in_details.get("audio_tokens", 0)),
                input_cached_tokens=int(in_details.get("cached_tokens", 0)),
                output_text_tokens=int(out_details.get("text_tokens", 0)),
                output_audio_tokens=int(out_details.get("audio_tokens", 0)),
            )
    return RealtimeEvent(provider="openai", type=event_type, usage=out_usage, turn_complete=turn_complete)


def parse_gemini_live_event(raw: bytes | str) -> RealtimeEvent:
    """One Gemini Live server message. usageMetadata is per-turn —
    verified against the live API (see module docstring)."""
    data = json.loads(raw)
    if data.get("setupComplete") is not None:
        event_type = "setupComplete"
        turn_complete = False
    elif data.get("serverContent") is not None:
        event_type = "serverContent"
        turn_complete = bool(data["serverContent"].get("turnComplete", False))
    else:
        event_type = "unknown"
        turn_complete = False

    out_usage: RealtimeUsage | None = None
    meta = data.get("usageMetadata")
    if meta is not None:
        input_text = input_audio = output_text = output_audio = 0
        for d in meta.get("promptTokensDetails") or []:
            if d.get("modality") == "TEXT":
                input_text += int(d.get("tokenCount", 0))
            elif d.get("modality") == "AUDIO":
                input_audio += int(d.get("tokenCount", 0))
        for d in meta.get("responseTokensDetails") or []:
            if d.get("modality") == "TEXT":
                output_text += int(d.get("tokenCount", 0))
            elif d.get("modality") == "AUDIO":
                output_audio += int(d.get("tokenCount", 0))
        out_usage = RealtimeUsage(
            input_tokens=int(meta.get("promptTokenCount", 0)),
            output_tokens=int(meta.get("responseTokenCount", 0)),
            total_tokens=int(meta.get("totalTokenCount", 0)),
            input_text_tokens=input_text,
            input_audio_tokens=input_audio,
            output_text_tokens=output_text,
            output_audio_tokens=output_audio,
            thoughts_tokens=int(meta.get("thoughtsTokenCount", 0)),
        )
    return RealtimeEvent(provider="gemini", type=event_type, usage=out_usage, turn_complete=turn_complete)


def parse_realtime_event(provider: RealtimeProviderName, raw: bytes | str) -> RealtimeEvent:
    if provider == "openai":
        return parse_openai_realtime_event(raw)
    if provider == "gemini":
        return parse_gemini_live_event(raw)
    raise ValueError(f"rateguard: unknown realtime provider {provider!r}")


@dataclass(frozen=True)
class RealtimeCostRates:
    """Micro-USD per MILLION tokens per class (e.g. $32/M = 32_000_000).
    Caller-priced: realtime pricing drifts too fast to bake in."""

    input_text_per_m_tokens: int = 0
    input_audio_per_m_tokens: int = 0
    input_cached_per_m_tokens: int = 0
    output_text_per_m_tokens: int = 0
    output_audio_per_m_tokens: int = 0

    def cost_micro_usd(self, u: RealtimeUsage) -> int:
        # Cached input priced at its own rate; the un-cached remainder of
        # text input at the text rate. Absent detail splits stay zero —
        # never guess a split the provider didn't report.
        uncached_text = max(u.input_text_tokens - u.input_cached_tokens, 0)
        total = (
            uncached_text * self.input_text_per_m_tokens
            + u.input_cached_tokens * self.input_cached_per_m_tokens
            + u.input_audio_tokens * self.input_audio_per_m_tokens
            + u.output_text_tokens * self.output_text_per_m_tokens
            + u.output_audio_tokens * self.output_audio_per_m_tokens
        )
        return total // 1_000_000


@dataclass(frozen=True)
class RealtimeSessionLimits:
    """Bounds for one session. 0 means unlimited."""

    max_total_tokens: int = 0
    max_audio_tokens: int = 0  # input+output audio — the expensive class
    max_turns: int = 0
    max_duration_seconds: float = 0.0
    max_estimated_cost_micro_usd: int = 0


@dataclass(frozen=True)
class RealtimeDecision:
    """The guard's verdict. exceeded is terminal once true (via
    observe/tick; peek may additionally report a derived, uncommitted
    duration breach)."""

    exceeded: bool
    reason: str  # "total_tokens" | "audio_tokens" | "turns" | "duration" | "cost" | ""
    totals: RealtimeUsage
    turns: int
    estimated_cost_micro_usd: int
    elapsed_seconds: float


class _SystemClock:
    def now(self) -> float:
        return _time.time()


@dataclass
class RealtimeSessionGuardOptions:
    limits: RealtimeSessionLimits = field(default_factory=RealtimeSessionLimits)
    cost_rates: RealtimeCostRates = field(default_factory=RealtimeCostRates)
    # Fires exactly once, on the observation that first breaches a limit.
    # Runs synchronously on the observing thread — keep it short.
    on_exceeded: Callable[[RealtimeDecision], None] | None = None
    clock: "_types.Clock | None" = None


class RealtimeSessionGuard:
    """Accumulates realtime usage for ONE session and enforces its
    limits. Thread-safe; create one per session."""

    def __init__(
        self,
        provider: RealtimeProviderName,
        options: RealtimeSessionGuardOptions | None = None,
    ) -> None:
        self._provider: RealtimeProviderName = provider
        self._opts = options or RealtimeSessionGuardOptions()
        self._clock = self._opts.clock or _SystemClock()
        self._started = self._clock.now()
        self._lock = threading.Lock()
        self._totals = RealtimeUsage()
        self._turns = 0
        self._cost = 0
        self._exceeded = False
        self._reason = ""
        self._notified = False

    def observe_raw(self, raw: bytes | str) -> tuple[RealtimeEvent, RealtimeDecision]:
        """Parse one inbound server frame and feed it to the guard. Raises
        on unparseable frames without corrupting state."""
        ev = parse_realtime_event(self._provider, raw)
        return ev, self.observe_event(ev)

    def observe_event(self, ev: RealtimeEvent) -> RealtimeDecision:
        fire: Callable[[RealtimeDecision], None] | None = None
        with self._lock:
            if ev.usage is not None:
                self._totals = self._totals.add(ev.usage)
                self._cost += self._opts.cost_rates.cost_micro_usd(ev.usage)
            if ev.turn_complete:
                self._turns += 1
            decision, fire = self._commit_locked()
        if fire is not None:
            fire(decision)
        return decision

    def tick(self) -> RealtimeDecision:
        """An observation of nothing but time — for a timer loop enforcing
        max_duration on a quiet session. Mutating like observe_event."""
        with self._lock:
            decision, fire = self._commit_locked()
        if fire is not None:
            fire(decision)
        return decision

    def peek(self) -> RealtimeDecision:
        """Pre-flight verdict: no state change, never fires on_exceeded.
        A not-yet-committed duration breach is REPORTED (derived from the
        clock) but not stored — the next observe/tick commits it."""
        with self._lock:
            elapsed = self._clock.now() - self._started
            decision = self._decision_locked(elapsed)
            if not self._exceeded:
                reason = self._breach_locked(elapsed)
                if reason:
                    decision = replace(decision, exceeded=True, reason=reason)
            return decision

    def _breach_locked(self, elapsed: float) -> str:
        limits = self._opts.limits
        if 0 < limits.max_total_tokens < self._totals.total_tokens:
            return "total_tokens"
        if 0 < limits.max_audio_tokens < self._totals.input_audio_tokens + self._totals.output_audio_tokens:
            return "audio_tokens"
        if 0 < limits.max_turns < self._turns:
            return "turns"
        if 0 < limits.max_duration_seconds < elapsed:
            return "duration"
        if 0 < limits.max_estimated_cost_micro_usd < self._cost:
            return "cost"
        return ""

    def _commit_locked(self) -> tuple[RealtimeDecision, Callable[[RealtimeDecision], None] | None]:
        elapsed = self._clock.now() - self._started
        if not self._exceeded:
            reason = self._breach_locked(elapsed)
            if reason:
                self._exceeded = True
                self._reason = reason
        decision = self._decision_locked(elapsed)
        if self._exceeded and not self._notified and self._opts.on_exceeded is not None:
            self._notified = True
            return decision, self._opts.on_exceeded
        return decision, None

    def _decision_locked(self, elapsed: float) -> RealtimeDecision:
        return RealtimeDecision(
            exceeded=self._exceeded,
            reason=self._reason,
            totals=self._totals,
            turns=self._turns,
            estimated_cost_micro_usd=self._cost,
            elapsed_seconds=elapsed,
        )
