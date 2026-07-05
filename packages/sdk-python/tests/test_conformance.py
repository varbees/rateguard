"""Replays the same admission sequence used by the Go and Node SDKs against
the shared oracle in conformance/token_bucket_vectors.json. A failure here
means Python has drifted from the documented cross-language behavior — not
just from its own past test suite.
"""

from __future__ import annotations

import json
from pathlib import Path

from rateguard import RateLimiter, ShardedLimiter
from rateguard.types import RateLimitOptions

from .helpers import FixedClock

VECTORS_PATH = Path(__file__).resolve().parents[3] / "conformance" / "token_bucket_vectors.json"


def test_matches_shared_oracle() -> None:
    vectors = json.loads(VECTORS_PATH.read_text())

    clock = FixedClock()
    limiter = RateLimiter(clock, capacity=1_000)
    options = RateLimitOptions(
        requests_per_second=vectors["policy"]["requests_per_second"],
        burst=vectors["policy"]["burst"],
    )

    for i, step in enumerate(vectors["steps"]):
        clock.advance(step["advance_ms"])
        d = limiter.increment("conformance-key", options, float(step["n"]))
        assert d.allowed == step["allowed"], f"step {i} ({step['note']})"
        if step["allowed"]:
            assert d.remaining == step["remaining"], f"step {i} ({step['note']})"
        else:
            assert d.retry_after_ms == step["retry_after_ms"], f"step {i} ({step['note']})"


def test_sharded_limiter_matches_shared_oracle() -> None:
    """ShardedLimiter is a decision-parity port (see its module docstring):
    same admission sequence against the same oracle must produce the same
    allowed/remaining/retry_after_ms as RateLimiter and the Go/Node SDKs."""
    vectors = json.loads(VECTORS_PATH.read_text())

    clock = FixedClock()
    limiter = ShardedLimiter(clock, capacity=1_000)
    options = RateLimitOptions(
        requests_per_second=vectors["policy"]["requests_per_second"],
        burst=vectors["policy"]["burst"],
    )

    for i, step in enumerate(vectors["steps"]):
        clock.advance(step["advance_ms"])
        d = limiter.increment("conformance-key", options, float(step["n"]))
        assert d.allowed == step["allowed"], f"step {i} ({step['note']})"
        if step["allowed"]:
            assert d.remaining == step["remaining"], f"step {i} ({step['note']})"
        else:
            assert d.retry_after_ms == step["retry_after_ms"], f"step {i} ({step['note']})"
