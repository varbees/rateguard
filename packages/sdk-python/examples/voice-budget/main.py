"""Voice session budgets — watch a session guard trip on real frames.

Runs offline with zero keys and zero dependencies: it replays REAL Gemini
Live server frames (captured from the live API on 2026-07-10, stored in
conformance/realtime_usage_vectors.json) through a RealtimeSessionGuard
until the session budget trips — exactly what the Pipecat/LiveKit adapters
do inside a live pipeline.

Run:
    cd packages/sdk-python
    PYTHONPATH=. python3 examples/voice-budget/main.py
"""

from __future__ import annotations

import json
from pathlib import Path

from rateguard import (
    RealtimeSessionGuard,
    RealtimeSessionGuardOptions,
    RealtimeSessionLimits,
)

VECTORS = Path(__file__).resolve().parents[4] / "conformance" / "realtime_usage_vectors.json"


def main() -> None:
    cases = json.loads(VECTORS.read_text())["cases"]
    # The real captured Gemini turn: 393 total tokens (375 prompt text,
    # 18 audio out, 21 thoughts).
    real_frame = json.dumps(
        next(c["event"] for c in cases if c["provider"] == "gemini" and c["expect"]["has_usage"])
    )

    guard = RealtimeSessionGuard(
        "gemini",
        RealtimeSessionGuardOptions(
            limits=RealtimeSessionLimits(max_total_tokens=1_000),
            on_exceeded=lambda d: print(
                f"\n⛔ SESSION HALTED — {d.reason}: {d.totals.total_tokens} tokens "
                f"across {d.turns} turns (limit 1000). The integrator now closes "
                f"the socket / interrupts the session."
            ),
        ),
    )

    print("Voice session with a 1,000-token budget; each turn is a REAL captured")
    print("Gemini Live frame (393 tokens: 375 text in, 18 audio out, 21 thoughts).\n")

    turn = 0
    while True:
        turn += 1
        event, decision = guard.observe_raw(real_frame)
        assert event.usage is not None
        status = "EXCEEDED" if decision.exceeded else "ok"
        print(
            f"turn {turn}: +{event.usage.total_tokens} tokens → "
            f"session total {decision.totals.total_tokens:>5} [{status}]"
        )
        if decision.exceeded:
            break

    # Pre-flight stays available after the trip — and never mutates.
    peek = guard.peek()
    print(f"\npeek(): exceeded={peek.exceeded} reason={peek.reason!r} — pre-flight is read-only")


if __name__ == "__main__":
    main()
