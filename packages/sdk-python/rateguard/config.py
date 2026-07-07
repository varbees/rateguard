from __future__ import annotations

from dataclasses import asdict
from urllib.parse import urlsplit, urlunsplit

from .types import (
    CircuitBreakerOptions,
    Clock,
    EventEmitterLike,
    PolicyPreset,
    PresetName,
    RateGuardOptions,
    RateLimitOptions,
    ResolvedRateGuardOptions,
    TokenBudgetMode,
    TokenBudgetOptions,
)


def system_clock() -> Clock:
    class _Clock:
        def now(self) -> float:
            import time

            return time.time() * 1000.0

    return _Clock()


def normalize_preset(preset: str | None) -> PresetName:
    match (preset or "").strip().lower():
        case "" | "free" | "dev":
            return "dev"
        case "starter" | "standard":
            return "standard"
        case "pro" | "high-throughput":
            return "high-throughput"
        case "business" | "enterprise" | "llm-heavy":
            return "llm-heavy"
        case "strict-upstream-protection":
            return "strict-upstream-protection"
        case "streaming-llm" | "streaming" | "llm-stream":
            return "streaming-llm"
        case "agent-orchestrator" | "agent" | "multi-agent" | "orchestrator":
            return "agent-orchestrator"
        case "mcp-server" | "mcp":
            return "mcp-server"
        case _:
            return "dev"


def normalize_token_budget_mode(mode: str | TokenBudgetMode | None) -> TokenBudgetMode:
    match (mode or "").strip().lower():
        case "" | "hard" | "reject" | "hard-stop":
            return "hard-stop"
        case "soft" | "queue" | "soft-stop":
            return "soft-stop"
        case _:
            return "hard-stop"


def preset_policy(preset: str | None) -> PolicyPreset:
    name = normalize_preset(preset)
    match name:
        case "standard":
            return PolicyPreset("standard", 100, 200, 10, 1_000_000, 10_000_000, 1_000_000, 10_000_000, 10_000, 100_000, 1_000_000, "hard-stop", True, False, True, False, True, 30)
        case "high-throughput":
            return PolicyPreset("high-throughput", 1_000, 2_000, 0, 10_000_000, 100_000_000, 10_000_000, 100_000_000, 100_000, 1_000_000, 10_000_000, "hard-stop", True, True, True, True, True, 90)
        case "llm-heavy":
            return PolicyPreset("llm-heavy", 500, 1_000, 0, 5_000_000, 25_000_000, 5_000_000, 250_000_000, 250_000, 2_500_000, 250_000_000, "soft-stop", True, True, True, True, True, 90)
        case "strict-upstream-protection":
            return PolicyPreset("strict-upstream-protection", 50, 75, 5, 500_000, 1_000_000, 500_000, 2_000_000, 5_000, 20_000, 2_000_000, "hard-stop", True, False, True, True, True, 14)
        case "streaming-llm":
            return PolicyPreset("streaming-llm", 200, 500, 0, 2_000_000, 5_000_000, 2_000_000, 500_000_000, 500_000, 5_000_000, 500_000_000, "soft-stop", True, True, True, True, True, 90)
        case "agent-orchestrator":
            return PolicyPreset("agent-orchestrator", 500, 1_000, 0, 10_000_000, 50_000_000, 10_000_000, 1_000_000_000, 1_000_000, 10_000_000, 1_000_000_000, "soft-stop", True, True, True, True, True, 180)
        case "mcp-server":
            return PolicyPreset("mcp-server", 30, 60, 0, 500_000, 1_000_000, 500_000, 50_000_000, 50_000, 500_000, 50_000_000, "hard-stop", True, False, True, True, True, 30)
        case _:
            return PolicyPreset("dev", 10, 20, 3, 100_000, 1_000_000, 100_000, 100_000, 1_000, 10_000, 100_000, "hard-stop", False, False, False, False, True, 7)


def resolve_rateguard_options(options: RateGuardOptions) -> ResolvedRateGuardOptions:
    preset = preset_policy(options.preset)
    rate_limit = options.rate_limit or RateLimitOptions()
    token_budget = options.token_budget or TokenBudgetOptions()
    circuit_breaker = normalize_circuit_breaker_options(options.circuit_breaker)
    clock = options.clock or system_clock()
    return ResolvedRateGuardOptions(
        api_key=options.api_key,
        preset=preset,
        tenant_id=(options.tenant_id or "global").strip() or "global",
        route_id=(options.route_id or "root").strip() or "root",
        upstream_id=(options.upstream_id or "local").strip() or "local",
        provider=(options.provider or "").strip() or None,
        model=(options.model or "").strip() or None,
        control_plane_url=(options.control_plane_url or "").strip() or None,
        ws_url=(options.ws_url or "").strip() or None,
        key_fn=options.key_fn,
        rate_limit=RateLimitOptions(
            requests_per_second=rate_limit.requests_per_second if rate_limit.requests_per_second is not None else preset.requests_per_second,
            burst=rate_limit.burst if rate_limit.burst is not None else preset.burst,
            window_ms=rate_limit.window_ms if rate_limit.window_ms is not None else 1_000,
            remote_rate_limit_endpoint=rate_limit.remote_rate_limit_endpoint,
        ),
        token_budget=TokenBudgetOptions(
            hour_limit=token_budget.hour_limit if token_budget.hour_limit is not None else preset.token_budget_per_hour,
            day_limit=token_budget.day_limit if token_budget.day_limit is not None else preset.token_budget_per_day,
            month_limit=token_budget.month_limit if token_budget.month_limit is not None else preset.token_budget_per_month,
            mode=normalize_token_budget_mode(token_budget.mode or preset.token_budget_mode),
            soft_stop_at=token_budget.soft_stop_at if token_budget.soft_stop_at is not None else 0.8,
        ),
        circuit_breaker=CircuitBreakerOptions(
            error_rate_threshold=circuit_breaker.error_rate_threshold,
            open_timeout_ms=circuit_breaker.open_timeout_ms,
            half_open_successes_required=circuit_breaker.half_open_successes_required,
            sample_size=circuit_breaker.sample_size,
        ),
        event_emitter=options.event_emitter,
        clock=clock,
        event_endpoint=(options.event_endpoint or "").strip() or None,
        guardrails=options.guardrails,
        loop_detection=bool(options.loop_detection),
        estimated_tokens_per_request=(
            int(options.estimated_tokens_per_request)
            if isinstance(options.estimated_tokens_per_request, (int, float)) and options.estimated_tokens_per_request > 0
            else 0
        ),
        adaptive_rate_limit=bool(options.adaptive_rate_limit),
        adaptive=options.adaptive,
        redis_client=options.redis_client,
        redis_async_client=options.redis_async_client,
        admin_cors_origin=options.admin_cors_origin,
    )


def normalize_circuit_breaker_options(options: CircuitBreakerOptions | None) -> CircuitBreakerOptions:
    raw = options or CircuitBreakerOptions()
    threshold = raw.error_rate_threshold
    open_timeout_ms = raw.open_timeout_ms
    half_open_successes_required = raw.half_open_successes_required
    sample_size = raw.sample_size

    return CircuitBreakerOptions(
        error_rate_threshold=threshold if threshold is not None and 0 < threshold <= 1 else 0.5,
        open_timeout_ms=int(open_timeout_ms) if open_timeout_ms is not None and open_timeout_ms > 0 else 60_000,
        half_open_successes_required=int(half_open_successes_required) if half_open_successes_required is not None and half_open_successes_required > 0 else 2,
        sample_size=int(sample_size) if sample_size is not None and sample_size > 0 else 100,
    )


def known_presets() -> list[PresetName]:
    """Return the canonical preset names in display order."""
    return ["dev", "standard", "high-throughput", "streaming-llm", "agent-orchestrator", "llm-heavy", "mcp-server", "strict-upstream-protection"]


def derive_ws_url(control_plane_url: str | None) -> str | None:
    if not control_plane_url:
        return None
    parsed = urlsplit(control_plane_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Invalid RateGuard control_plane_url: {control_plane_url}")

    scheme = "wss" if parsed.scheme == "https" else "ws"
    path = f"{parsed.path.rstrip('/')}/ws"
    return urlunsplit((scheme, parsed.netloc, path, parsed.query, parsed.fragment))
