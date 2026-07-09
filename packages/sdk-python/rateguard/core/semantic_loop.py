"""Semantic Loop Detection — catching the paraphrase loop.

SHA-256 fingerprinting (loop detection) catches an agent repeating itself
byte-for-byte. It provably cannot catch the loop that actually produced
the documented $47K incident: two agents ping-ponging messages that were
semantically identical but worded differently on every turn.

SemanticLoopDetector closes that gap: it embeds each step locally (see
static_embedder.py — no network, no inference runtime) and compares the
incoming step against a sliding window of the sequence's recent steps.
Enough near-duplicates inside the window means the agent is circling.

Defaults are calibrated against measured potion-base-2M cosine
separations (2026-07-09, mirrored from the Go reference): tight
paraphrases of one ask score 0.92-0.99; enumeration workloads (same
template, different entity) top out near 0.80; genuinely distinct task
steps stay under 0.67. The 0.90 default threshold sits in the gap.

Honest limitation: loosely reworded repeats (measured 0.73-0.86) are
indistinguishable from enumeration at this model size and will NOT be
caught by the default — lowering the threshold below ~0.85 trades that
for false positives on template workloads.
"""

from __future__ import annotations

import math
import threading
from dataclasses import dataclass, field

from .bounded_cache import BoundedCache
from .semantic_cache import Embedder

DEFAULT_SEMANTIC_LOOP_WINDOW = 8
DEFAULT_SEMANTIC_LOOP_THRESHOLD = 0.90
DEFAULT_SEMANTIC_LOOP_MIN_REPEATS = 2
DEFAULT_SEMANTIC_LOOP_MAX_KEYS = 10000


@dataclass(frozen=True)
class SemanticLoopOptions:
    """Configuration for a SemanticLoopDetector.

    window: recent steps kept per key (default 8).
    threshold: cosine similarity at or above which two steps count as the
        same step reworded (default 0.90 — see module docstring for the
        measured basis).
    min_repeats: window entries that must match for a loop (default 2 —
        a two-agent ping-pong trips on the third appearance).
    max_keys: bound on distinct tracked sequence keys, LRU (default 10000).
    """

    window: int = DEFAULT_SEMANTIC_LOOP_WINDOW
    threshold: float = DEFAULT_SEMANTIC_LOOP_THRESHOLD
    min_repeats: int = DEFAULT_SEMANTIC_LOOP_MIN_REPEATS
    max_keys: int = DEFAULT_SEMANTIC_LOOP_MAX_KEYS


@dataclass(frozen=True)
class SemanticLoopDecision:
    """Outcome of a semantic loop check."""

    loop: bool
    matches: int
    max_similarity: float


@dataclass
class _Window:
    vecs: list[list[float]] = field(default_factory=list)


class SemanticLoopDetector:
    """Detects reworded agent loops via local embeddings.

    Safe for concurrent use from threads and asyncio tasks.
    """

    def __init__(self, embedder: Embedder, options: SemanticLoopOptions | None = None) -> None:
        o = options or SemanticLoopOptions()
        self._embedder = embedder
        self._window = o.window if o.window > 0 else DEFAULT_SEMANTIC_LOOP_WINDOW
        self._threshold = o.threshold if o.threshold > 0 else DEFAULT_SEMANTIC_LOOP_THRESHOLD
        self._min_repeats = o.min_repeats if o.min_repeats > 0 else DEFAULT_SEMANTIC_LOOP_MIN_REPEATS
        max_keys = o.max_keys if o.max_keys > 0 else DEFAULT_SEMANTIC_LOOP_MAX_KEYS
        self._windows: BoundedCache[str, _Window] = BoundedCache(max_keys)
        self._lock = threading.Lock()

    async def check(self, key: str, step_text: str) -> SemanticLoopDecision:
        """Embed the step, compare against the key's recent window, and
        record it for future checks. Recording happens regardless of the
        decision so an operator who continues past a warning still has an
        accurate window."""
        return await self._evaluate(key, step_text, record=True)

    async def peek(self, key: str, step_text: str) -> SemanticLoopDecision:
        """Non-consuming pre-flight variant: same decision, but the step
        is NOT recorded. Rule: pre-flight queries never mutate state."""
        return await self._evaluate(key, step_text, record=False)

    def reset(self, key: str) -> None:
        """Forget a key's window — call when a sequence legitimately
        restarts."""
        with self._lock:
            self._windows.delete(key)

    async def _evaluate(self, key: str, step_text: str, *, record: bool) -> SemanticLoopDecision:
        vec = await self._embedder.embed(step_text)

        with self._lock:
            w = self._windows.get(key) or _Window()

            matches = 0
            max_similarity = 0.0
            for prev in w.vecs:
                sim = _cosine_similarity(vec, prev)
                if sim > max_similarity:
                    max_similarity = sim
                if sim >= self._threshold:
                    matches += 1
            loop = matches >= self._min_repeats

            if record:
                w.vecs.append(list(vec))
                if len(w.vecs) > self._window:
                    del w.vecs[: len(w.vecs) - self._window]
                self._windows.set(key, w)

        return SemanticLoopDecision(loop=loop, matches=matches, max_similarity=max_similarity)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity tolerating unnormalized and zero vectors (a zero
    vector matches nothing)."""
    n = min(len(a), len(b))
    dot = 0.0
    na = 0.0
    nb = 0.0
    for i in range(n):
        dot += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))
