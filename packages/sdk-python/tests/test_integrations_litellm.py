"""litellm / CrewAI adapter: wrap_completion enforces budgets from the response,
provider-agnostic (no real litellm needed — a fake completion fn stands in)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest

from rateguard import RateGuard, TokenBudgetOptions
from rateguard.exceptions import BudgetExceeded


def _resp(total: int) -> SimpleNamespace:
    """A litellm ModelResponse-shaped object with a .usage.total_tokens."""
    return SimpleNamespace(
        usage=SimpleNamespace(prompt_tokens=total // 2, completion_tokens=total - total // 2, total_tokens=total)
    )


def _key(rg: RateGuard, provider: str, model: str) -> str:
    return f"{rg.runtime.config.tenant_id}:{provider}:{model}:outbound"


def _hour(rg: RateGuard, provider: str, model: str) -> int:
    key = _key(rg, provider, model)
    return int(rg.runtime.token_budget.usage(key, rg.runtime.config.token_budget)["hour"])


def test_wrap_completion_meters_and_hard_stops() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=600))
    calls = {"n": 0}

    def fake_completion(**kwargs: Any) -> Any:
        calls["n"] += 1
        return _resp(500)

    guarded = rg.wrap_completion(fake_completion)

    guarded(model="gpt-4o", messages=[])  # 500 of 600 used
    guarded(model="gpt-4o", messages=[])  # final overshoot allowed -> 1000 used
    with pytest.raises(BudgetExceeded):
        guarded(model="gpt-4o", messages=[])  # exhausted -> raises before the call

    assert calls["n"] == 2, "the blocked call must never reach the provider"
    assert _hour(rg, "openai", "gpt-4o") == 1000


def test_wrap_completion_releases_budget_on_error() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=10_000))

    def boom(**kwargs: Any) -> Any:
        raise RuntimeError("provider down")

    guarded = rg.wrap_completion(boom)
    with pytest.raises(RuntimeError):
        guarded(model="gpt-4o", messages=[])
    # A failed call consumes no budget — the reservation is released.
    assert _hour(rg, "openai", "gpt-4o") == 0


def test_wrap_completion_streaming_charges_estimate() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=100_000))

    def fake_stream(**kwargs: Any) -> Any:
        return iter([])  # a generator — usage isn't known synchronously

    guarded = rg.wrap_completion(fake_stream)
    guarded(model="gpt-4o", messages=[], stream=True)
    # Unmeasurable streaming charges the reserved estimate, not zero.
    assert _hour(rg, "openai", "gpt-4o") == 4096


def test_provider_and_model_from_prefixed_string() -> None:
    # litellm "provider/model" strings scope correctly.
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=10_000))

    async def fake_acompletion(**kwargs: Any) -> Any:
        return _resp(300)

    guarded = rg.wrap_acompletion(fake_acompletion)
    asyncio.run(guarded(model="anthropic/claude-sonnet-4", messages=[]))
    assert _hour(rg, "anthropic", "claude-sonnet-4") == 300
