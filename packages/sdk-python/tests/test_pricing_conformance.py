"""conformance/pricing.json is the single source of the built-in price table;
all three SDKs replay it. A row that prices differently in any SDK, or a
current model that prices at $0, fails here."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from rateguard import StaticPricing, ModelPrice, estimate_cost, estimate_cost_with, priced_models

ROWS = json.loads(
    (Path(__file__).resolve().parents[3] / "conformance" / "pricing.json").read_text()
)["models"]


def test_every_row_is_a_key_of_the_builtin_table() -> None:
    assert len(priced_models()) == len(ROWS)


@pytest.mark.parametrize("row", ROWS, ids=[r["id"] for r in ROWS])
def test_row_prices_as_the_vendor_page_says(row: dict) -> None:
    assert estimate_cost(row["id"], 1000, 1000) == pytest.approx((row["input"] + row["output"]) / 1000, abs=1e-12)
    lc = row.get("longContext")
    if not lc:
        return
    at = lc["aboveTokens"]
    # Exactly at the threshold is still the base rate; one over pays the long rates on everything.
    assert estimate_cost(row["id"], at, 1000) == pytest.approx((at * row["input"] + 1000 * row["output"]) / 1e6, abs=1e-12)
    assert estimate_cost(row["id"], at + 1, 1000) == pytest.approx(
        ((at + 1) * lc["input"] + 1000 * lc["output"]) / 1e6, abs=1e-12
    )


@pytest.mark.parametrize(
    "model",
    [
        "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1",
        "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001",
        "gpt-6.1-sol", "gpt-6-astra", "gpt-5.5", "gpt-5.4-mini-2026-03-17",
        "gemini-4-argon", "gemini-3.1-pro-preview", "gemini-2.5-flash",
        "deepseek-v4-pro", "deepseek-flash",
    ],
)
def test_models_people_actually_run_are_never_free(model: str) -> None:
    assert estimate_cost(model, 1000, 1000) > 0


def test_exact_only_snapshot_keeps_its_own_price() -> None:
    assert estimate_cost("gpt-4o-2024-05-13", 1000, 1000) == pytest.approx((5 + 15) / 1000, abs=1e-12)
    assert estimate_cost("gpt-4o-2024-08-06", 1000, 1000) == pytest.approx((2.5 + 10) / 1000, abs=1e-12)


def test_callers_price_is_flat() -> None:
    p = StaticPricing({"claude-haiku-5-5": ModelPrice(1.0, 1.0)})
    assert estimate_cost_with(p, "claude-haiku-5-5", 200_000, 0) == pytest.approx(200.0)


def _cache_rates(tier: dict) -> tuple[float, float, float, float]:
    """Input, cache-read, write and long-TTL write for a tier, with the
    documented fallbacks: no cacheRead/cacheWrite → input rate, no
    cacheWriteLongTTL → cacheWrite."""
    write = tier.get("cacheWrite", tier["input"])
    return tier["input"], tier.get("cacheRead", tier["input"]), write, tier.get("cacheWriteLongTTL", write)


@pytest.mark.parametrize("row", ROWS, ids=[r["id"] for r in ROWS])
def test_row_cache_rates_as_the_vendor_page_says(row: dict) -> None:
    from rateguard import estimate_usage_cost
    from rateguard.types import TokenUsage

    # 1,000 fresh + 2,000 read + 3,000 written (1,000 of them at the long TTL).
    inp, read, write, write_long = _cache_rates(row)
    usage = TokenUsage(input_tokens=6000, cache_read_tokens=2000, cache_write_tokens=3000, cache_write_long_ttl_tokens=1000)
    want = (1000 * inp + 2000 * read + 2000 * write + 1000 * write_long) / 1e6
    assert estimate_usage_cost(row["id"], usage) == pytest.approx(want, abs=1e-12)
    lc = row.get("longContext")
    if not lc:
        return
    # The tier is chosen on the whole prompt, cached parts included.
    at = lc["aboveTokens"]
    inp, read, write, write_long = _cache_rates(lc)
    usage = TokenUsage(input_tokens=at + 1, cache_read_tokens=2000, cache_write_tokens=3000, cache_write_long_ttl_tokens=1000)
    want = ((at + 1 - 5000) * inp + 2000 * read + 2000 * write + 1000 * write_long) / 1e6
    assert estimate_usage_cost(row["id"], usage) == pytest.approx(want, abs=1e-12)


def test_caller_price_without_cache_rates_bills_cache_at_input() -> None:
    from rateguard import estimate_usage_cost_with
    from rateguard.types import TokenUsage

    usage = TokenUsage(input_tokens=3000, cache_read_tokens=1000, cache_write_tokens=1000, cache_write_long_ttl_tokens=500)
    plain = StaticPricing({"my-model": ModelPrice(1.0, 2.0)})
    assert estimate_usage_cost_with(plain, "my-model", usage) == pytest.approx(3.0, abs=1e-12)
    cached = StaticPricing({"my-model": ModelPrice(1.0, 2.0, cache_read_usd_per_1k=0.1, cache_write_usd_per_1k=1.25,
                                                  cache_write_long_ttl_usd_per_1k=2.0)})
    assert estimate_usage_cost_with(cached, "my-model", usage) == pytest.approx(1.0 + 0.1 + 0.625 + 1.0, abs=1e-12)
