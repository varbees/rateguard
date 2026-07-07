from __future__ import annotations

from rateguard import CircuitBreaker
from rateguard.types import CircuitBreakerOptions

from .helpers import FixedClock


def test_circuit_breaker_transitions_closed_open_half_open_closed() -> None:
    clock = FixedClock()
    breaker = CircuitBreaker(
        clock,
        CircuitBreakerOptions(
            error_rate_threshold=0.5,
            open_timeout_ms=1_000,
            half_open_successes_required=2,
            sample_size=10,
        ),
    )

    for _ in range(10):
        breaker.record_outcome(False)

    assert breaker.get_state() == "open"

    clock.advance(1_001)
    assert breaker.allow().state == "half-open"
    assert breaker.record_outcome(True).state == "half-open"
    assert breaker.record_outcome(True).state == "closed"
    assert breaker.record_outcome(True).state == "closed"


def test_release_probe_unwedges_half_open() -> None:
    """Reproduces the bug this SDK shipped with: a half-open probe granted
    by allow() that never got record_outcome called on it (because it was
    denied by something other than the upstream call) used to leak
    forever, permanently wedging the breaker. release_probe must clear it
    without counting as a success or a failure."""
    clock = FixedClock()
    breaker = CircuitBreaker(
        clock,
        CircuitBreakerOptions(
            error_rate_threshold=0.5,
            open_timeout_ms=1_000,
            half_open_successes_required=1,
            sample_size=10,
        ),
    )

    for _ in range(10):
        breaker.record_outcome(False)
    assert breaker.get_state() == "open"

    clock.advance(2_000)
    probe = breaker.allow()
    assert probe.allowed is True
    assert probe.probe_in_flight is True

    # Simulate the probe request getting denied by an unrelated gate
    # before it ever reaches upstream — nothing calls record_outcome.
    # Without release_probe, every future allow() would report
    # probe_in_flight forever.
    stuck = breaker.allow()
    assert stuck.allowed is False
    assert stuck.probe_in_flight is True

    breaker.release_probe()

    freed = breaker.allow()
    assert freed.allowed is True
    assert freed.probe_in_flight is True
    assert breaker.record_outcome(True).state == "closed"


def test_circuit_breaker_normalizes_invalid_options() -> None:
    clock = FixedClock()
    breaker = CircuitBreaker(
        clock,
        CircuitBreakerOptions(
            error_rate_threshold=2,
            open_timeout_ms=0,
            half_open_successes_required=0,
            sample_size=0,
        ),
    )

    for _ in range(10):
        breaker.record_outcome(False)

    assert breaker.get_state() == "open"
