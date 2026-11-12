"""USD budgets (0.6, docs/specs/0.6-usd-budgets.md).

Money is integer micro-USD everywhere after config load. Two float steps are
DEFINED as IEEE-754 double operations, identical in Go, Node and Python::

    usd_to_micro(usd)            = floor(usd * 1e6 + 0.5)
    rate_micro_per_m(usd_per_1k) = floor(usd_per_1k * 1e9 + 0.5)   # micro-USD per 1M tokens

Everything after that is exact integer arithmetic, rounded UP once::

    reserve = ceil((prompt * max(input, cache_write, cache_write_long_ttl) + output * output) / 1e6)
    cost    = ceil((fresh*input + read*cache_read + (write-write_long)*cache_write
                    + write_long*cache_write_long_ttl + output*output) / 1e6)

The reservation prices every prompt token at the HIGHEST input rate the call
could be billed at, so a cache-write premium can never push the real cost past
what was reserved. conformance/usd_budget_vectors.json pins all of it.

These are estimates from RateGuard's price table, not the provider's invoice.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from .genai import ModelPrice
    from ..types import TokenUsage

USDBudgetScope = Literal["tenant", "customer", "model"]
USDBudgetUnpriced = Literal["deny", "allow-uncounted"]

MICRO_PER_USD = 1_000_000


@dataclass(frozen=True, slots=True)
class MicroRates:
    """A ModelPrice as integer micro-USD per 1M tokens."""

    input: int
    output: int
    cache_read: int
    cache_write: int
    cache_write_long_ttl: int


def usd_to_micro(usd: float) -> int:
    """Dollars to integer micro-USD. Raises ValueError on a negative or non-finite amount."""
    if not isinstance(usd, (int, float)) or math.isnan(usd) or math.isinf(usd) or usd < 0:
        raise ValueError(f"rateguard: USD amount must be a finite number >= 0, got {usd!r}")
    return math.floor(float(usd) * 1e6 + 0.5)


def _rate(usd_per_1k: float) -> int:
    return math.floor(usd_per_1k * 1e9 + 0.5) if usd_per_1k and usd_per_1k > 0 else 0


def micro_rates(price: "ModelPrice") -> MicroRates:
    """A missing cache read or write rate bills at the input rate; a missing
    long-TTL write rate at the write rate."""
    inp = _rate(price.prompt_usd_per_1k)
    cw = _rate(price.cache_write_usd_per_1k) or inp
    return MicroRates(
        input=inp,
        output=_rate(price.completion_usd_per_1k),
        cache_read=_rate(price.cache_read_usd_per_1k) or inp,
        cache_write=cw,
        cache_write_long_ttl=_rate(price.cache_write_long_ttl_usd_per_1k) or cw,
    )


def _ceil_micro(n: int) -> int:
    return -(-n // MICRO_PER_USD)


def _non_neg(n: int | None) -> int:
    return int(n) if n and n > 0 else 0


def reserve_micro_usd(rates: MicroRates, prompt_tokens: int, output_tokens: int) -> int:
    """The micro-USD to hold for a call before it is sent."""
    in_rate = max(rates.input, rates.cache_write, rates.cache_write_long_ttl)
    return _ceil_micro(_non_neg(prompt_tokens) * in_rate + _non_neg(output_tokens) * rates.output)


def cost_micro_usd(rates: MicroRates, usage: "TokenUsage") -> int:
    """The estimated micro-USD a call actually cost, from its measured usage."""
    read = _non_neg(getattr(usage, "cache_read_tokens", 0))
    write = _non_neg(getattr(usage, "cache_write_tokens", 0))
    write_long = min(_non_neg(getattr(usage, "cache_write_long_ttl_tokens", 0)), write)
    fresh = max(_non_neg(usage.input_tokens) - read - write, 0)
    return _ceil_micro(
        fresh * rates.input
        + read * rates.cache_read
        + (write - write_long) * rates.cache_write
        + write_long * rates.cache_write_long_ttl
        + _non_neg(usage.output_tokens) * rates.output
    )


def usd_budget_key(scope: str, tenant: str, customer: str | None, provider: str, model: str | None) -> str:
    """The budget key a call draws from. Dollars are comparable across models,
    so the default scope ("customer") drops provider and model."""
    cust = f":customer={customer}" if customer else ""
    if scope == "tenant":
        return f"{tenant}:usd"
    if scope == "model":
        return f"{tenant}{cust}:{provider}:{model or 'default'}:usd"
    return f"{tenant}{cust}:usd"


@dataclass(frozen=True, slots=True)
class USDBudgetState:
    """A read of the estimated-USD budget, in integer micro-USD."""

    applied: bool
    allowed: bool
    key: str
    limit_micro_usd: int
    # -1 when no budget applies.
    remaining_micro_usd: int
    window: str
    retry_after_ms: int
    warning: bool
