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
