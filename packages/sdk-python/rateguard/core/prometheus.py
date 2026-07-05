"""
Prometheus /metrics endpoint — zero dependencies, stdlib only.

Exposes RateGuard counters in Prometheus exposition format.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import PolicyPreset


def prometheus_text(
    policy: PolicyPreset,
    total_requests: int = 0,
    rate_limit_hits: int = 0,
    token_budget_exhausted: int = 0,
    circuit_breaker_trips: int = 0,
    tokens_consumed: int = 0,
    circuit_breaker_state: int = 0,  # 0=closed, 1=open, 2=half-open
    guardrail_violations: int = 0,
    version: str = "dev",
) -> str:
    """Generate Prometheus exposition format text for RateGuard metrics."""

    lines: list[str] = []

    # Rate limit config gauge
    lines.append("# HELP rateguard_rate_limit_config Rate limit configuration")
    lines.append("# TYPE rateguard_rate_limit_config gauge")
    lines.append(
        f'rateguard_rate_limit_config{{preset="{policy.name}",rps="{policy.requests_per_second}",burst="{policy.burst}"}} 1'
    )

    # Token budget config gauge
    lines.append("# HELP rateguard_token_budget_config Token budget configuration")
    lines.append("# TYPE rateguard_token_budget_config gauge")
    lines.append(
        f'rateguard_token_budget_config{{preset="{policy.name}",per_hour="{policy.token_budget_per_hour}",per_day="{policy.token_budget_per_day}",per_month="{policy.token_budget_per_month}",mode="{policy.token_budget_mode}"}} 1'
    )

    # Circuit breaker state
    lines.append("# HELP rateguard_circuit_breaker_state Current circuit breaker state")
    lines.append("# TYPE rateguard_circuit_breaker_state gauge")
    lines.append(f"rateguard_circuit_breaker_state {circuit_breaker_state}")

    # Counters
    lines.append("# HELP rateguard_requests_total Total requests processed")
    lines.append("# TYPE rateguard_requests_total counter")
    lines.append(f"rateguard_requests_total {total_requests}")

    lines.append("# HELP rateguard_rate_limit_hits_total Rate limit hits")
    lines.append("# TYPE rateguard_rate_limit_hits_total counter")
    lines.append(f"rateguard_rate_limit_hits_total {rate_limit_hits}")

    lines.append("# HELP rateguard_token_budget_exhausted_total Token budget exhaustion events")
    lines.append("# TYPE rateguard_token_budget_exhausted_total counter")
    lines.append(f"rateguard_token_budget_exhausted_total {token_budget_exhausted}")

    lines.append("# HELP rateguard_circuit_breaker_trips_total Circuit breaker trip events")
    lines.append("# TYPE rateguard_circuit_breaker_trips_total counter")
    lines.append(f"rateguard_circuit_breaker_trips_total {circuit_breaker_trips}")

    lines.append("# HELP rateguard_tokens_consumed_total Total tokens consumed")
    lines.append("# TYPE rateguard_tokens_consumed_total counter")
    lines.append(f"rateguard_tokens_consumed_total {tokens_consumed}")

    lines.append("# HELP rateguard_guardrail_violations_total Content guardrail violations (PII, prompt injection, length)")
    lines.append("# TYPE rateguard_guardrail_violations_total counter")
    lines.append(f"rateguard_guardrail_violations_total {guardrail_violations}")

    # SDK info
    lines.append("# HELP rateguard_sdk_info SDK version and build info")
    lines.append("# TYPE rateguard_sdk_info gauge")
    lines.append(f'rateguard_sdk_info{{version="{version}",language="python"}} 1')

    return "\n".join(lines) + "\n"
