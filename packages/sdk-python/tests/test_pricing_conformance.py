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
