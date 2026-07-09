"""Semantic loop detector: mechanics with a fixed-vector embedder, plus
the gated real-model reproduction of the documented $47K loop shape."""

from __future__ import annotations

import hashlib
import os

import pytest

from rateguard import SemanticLoopDetector, SemanticLoopOptions, StaticEmbedder


class FixedVecEmbedder:
    def __init__(self) -> None:
        self.vecs: dict[str, list[float]] = {
            "A": [1, 0],
            "A'": [0.999, 0.045],  # cosine vs A ≈ 0.999
            "A2": [0.998, 0.06],  # cosine vs A ≈ 0.998
            "B": [0, 1],
            "C": [0.7071, 0.7071],  # cosine vs A ≈ 0.707 — below threshold
            "Z": [0, 0],  # zero vector — matches nothing
        }

    async def embed(self, text: str) -> list[float]:
        return [float(x) for x in self.vecs[text]]


@pytest.mark.asyncio
async def test_trips_on_paraphrase_ping_pong() -> None:
    d = SemanticLoopDetector(FixedVecEmbedder())
    steps = [("A", False), ("B", False), ("A'", False), ("B", False), ("A2", True)]
    for i, (text, want_loop) in enumerate(steps):
        dec = await d.check("agent-1", text)
        assert dec.loop == want_loop, f"step {i} ({text}): {dec}"


@pytest.mark.asyncio
async def test_ignores_distinct_steps() -> None:
    d = SemanticLoopDetector(FixedVecEmbedder())
    # A and C are related but distinct (cosine ≈ 0.707, below threshold):
    # they must never count as matches for each other. An identical repeat
    # of C matches itself at cosine 1.0 (semantic subsumes exact), but one
    # match stays below min_repeats — never a loop.
    first = await d.check("agent-2", "A")
    assert first.matches == 0
    c1 = await d.check("agent-2", "C")
    assert c1.matches == 0, "A vs C counted as a match below threshold"
    a2 = await d.check("agent-2", "A")
    assert a2.matches == 1 and not a2.loop  # matches its own earlier A only
    c2 = await d.check("agent-2", "C")
    assert c2.matches == 1 and not c2.loop  # matches its own earlier C only


@pytest.mark.asyncio
async def test_peek_never_records() -> None:
    d = SemanticLoopDetector(FixedVecEmbedder())
    for _ in range(10):
        dec = await d.peek("agent-3", "A")
        assert not dec.loop and dec.matches == 0
    dec = await d.check("agent-3", "A")
    assert dec.matches == 0, "peek polluted the window"


@pytest.mark.asyncio
async def test_reset_and_window_bound() -> None:
    d = SemanticLoopDetector(FixedVecEmbedder(), SemanticLoopOptions(window=2, min_repeats=2))
    for s in ["A", "A'", "B", "B"]:
        await d.check("agent-4", s)
    # Window now holds [B, B] — A2 matches nothing.
    dec = await d.check("agent-4", "A2")
    assert dec.matches == 0, "window bound not enforced"

    d.reset("agent-4")
    dec = await d.check("agent-4", "A2")
    assert dec.matches == 0 and not dec.loop


@pytest.mark.asyncio
async def test_zero_vector_matches_nothing() -> None:
    d = SemanticLoopDetector(FixedVecEmbedder())
    for _ in range(5):
        dec = await d.check("agent-5", "Z")
        assert not dec.loop and dec.matches == 0


@pytest.mark.asyncio
async def test_real_model_paraphrase_loop() -> None:
    """Gated: the $47K shape — reworded ping-pong with byte-distinct
    hashes must trip; distinct task steps must not."""
    model_path = os.environ.get("RATEGUARD_EMBED_MODEL")
    if not model_path:
        pytest.skip("RATEGUARD_EMBED_MODEL not set")
    e = StaticEmbedder.load(model_path)
    d = SemanticLoopDetector(e)

    steps = [
        "Please verify the market analysis report for the renewable energy sector.",
        "The analysis is incomplete, send the full market report again for review.",
        "Kindly review and verify the renewable energy sector market analysis report.",
        "This analysis remains incomplete, resend the complete market report for review.",
        "Could you verify the market analysis report on the renewable energy sector?",
    ]
    assert len({hashlib.sha256(s.encode()).hexdigest() for s in steps}) == len(steps)

    tripped = -1
    for i, s in enumerate(steps):
        dec = await d.check("analyzer-verifier", s)
        if dec.loop:
            tripped = i
            break
    assert 0 <= tripped <= 4, "semantic loop detector never tripped on the reworded ping-pong"

    control = [
        "Search the web for current renewable energy market size figures.",
        "Summarize the top three findings from the search results.",
        "Draft an executive summary paragraph from the findings.",
        "Create a table comparing solar and wind capacity growth.",
        "Write the conclusion section referencing the comparison table.",
    ]
    for s in control:
        dec = await d.check("control", s)
        assert not dec.loop, f"false positive on distinct step: {s!r} ({dec})"
