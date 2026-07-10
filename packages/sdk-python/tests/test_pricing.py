"""Custom-model pricing: PricingProvider override, StaticPricing, and
model-ID normalization so a provider-reported dated snapshot prices correctly."""

from __future__ import annotations

import pytest

from rateguard import ModelPrice, StaticPricing, estimate_cost, estimate_cost_with, normalize_model_id


@pytest.mark.parametrize(
    ("model", "want"),
    [
        ("gpt-4o-2024-08-06", "gpt-4o"),  # OpenAI ISO snapshot
        ("gpt-4.1-2025-04-14", "gpt-4.1"),  # dotted version kept
        ("o3-2025-04-16", "o3"),
        ("claude-sonnet-4-20250514", "claude-sonnet-4"),  # Anthropic compact date
        ("claude-opus-4-5-20251101", "claude-opus-4-5"),  # date stripped, minor kept
        ("gemini-2.5-flash-09-2025", "gemini-2.5-flash"),  # MM-YYYY
        ("gemini-2.5-flash-preview", "gemini-2.5-flash"),
        ("gemini-2.5-flash-latest", "gemini-2.5-flash"),
        ("GPT-4O", "gpt-4o"),  # case-folded
        ("gpt-4o-mini", "gpt-4o-mini"),  # meaningful word NOT stripped
        ("o4-mini", "o4-mini"),
        ("claude-sonnet-4-5", "claude-sonnet-4-5"),  # bare minor version NOT stripped
        ("gemini-2.5-flash-lite", "gemini-2.5-flash-lite"),  # lite NOT stripped
        ("my-custom-finetune", "my-custom-finetune"),
    ],
)
def test_normalize_model_id(model: str, want: str) -> None:
    assert normalize_model_id(model) == want


def test_dated_snapshot_matches_base_table_entry() -> None:
    # A provider-reported dated ID must resolve to the base entry — otherwise
    # every real streaming response prices at $0.
    bare = estimate_cost("gpt-4o", 1000, 1000)
    assert bare > 0
    assert estimate_cost("gpt-4o-2024-08-06", 1000, 1000) == bare


def test_static_pricing_overrides_normalizes_and_falls_through() -> None:
    p = StaticPricing(
        {
            "my-model": ModelPrice(0.001, 0.002),
            "gpt-4o": ModelPrice(1.0, 2.0),  # override the built-in
        }
    )
    # custom model the built-in table has never heard of
    assert estimate_cost_with(p, "my-model", 1000, 1000) == pytest.approx(0.003)
    # user override wins over the built-in table
    assert estimate_cost_with(p, "gpt-4o", 1000, 1000) == pytest.approx(3.0)
    # dated snapshot of the overridden model resolves via normalization
    assert estimate_cost_with(p, "gpt-4o-2024-08-06", 1000, 1000) == pytest.approx(3.0)
    # provider miss falls through to the built-in table
    assert estimate_cost_with(p, "claude-sonnet-4", 1000, 1000) > 0
    # unknown everywhere -> zero, never fabricated
    assert estimate_cost_with(p, "totally-unknown-model", 1000, 1000) == 0.0
