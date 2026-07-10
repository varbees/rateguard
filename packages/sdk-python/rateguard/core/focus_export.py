"""FOCUS export — spend data in the FinOps interchange shape.

FOCUS (FinOps Open Cost and Usage Specification, focus.finops.org) is the
column contract enterprise cost tooling ingests. This export is
FOCUS-ALIGNED: core columns follow the spec (ConsumedQuantity/ConsumedUnit
are the spec's own home for token usage — FOCUS 1.2's virtual-currency
work uses GPT tokens as its worked example), and RateGuard-specific
detail rides in ``x_``-prefixed columns, the spec's sanctioned extension
convention.

Honest scope: costs here are RateGuard's pricing-table ESTIMATES of LLM
spend observed in-process, not a provider invoice. BilledCost is
deliberately 0 — RateGuard bills nothing; EffectiveCost carries the
estimate. Reconcile against provider billing for accounting truth.
"""

from __future__ import annotations

import base64
import csv
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import IO

from .spend_receipt import SpendReceipt

FOCUS_HEADER = [
    "ChargePeriodStart", "ChargePeriodEnd", "ChargeCategory", "ChargeDescription",
    "BilledCost", "EffectiveCost", "BillingCurrency",
    "ProviderName", "ServiceName", "ServiceCategory",
    "ResourceId", "SkuId", "ConsumedQuantity", "ConsumedUnit",
    "x_rateguard_input_tokens", "x_rateguard_output_tokens",
    "x_rateguard_policy_preset", "x_rateguard_attestation_token_id",
    "x_rateguard_receipt_signature",
]


@dataclass(frozen=True)
class FOCUSRow:
    """One charge-period row; field order is the CSV column order."""

    charge_period_start: str
    charge_period_end: str
    charge_category: str
    charge_description: str
    billed_cost: float
    effective_cost: float
    billing_currency: str
    provider_name: str
    service_name: str
    service_category: str
    resource_id: str
    sku_id: str
    consumed_quantity: float
    consumed_unit: str
    x_input_tokens: int
    x_output_tokens: int
    x_policy_preset: str
    x_attestation_token_id: str
    x_receipt_signature: str


def _iso_utc(unix_seconds: int) -> str:
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def focus_row_from_receipt(receipt: SpendReceipt) -> FOCUSRow:
    c = receipt.claims
    desc = "LLM token usage metered in-process by RateGuard"
    if c.model:
        desc = f"LLM token usage ({c.model}) metered in-process by RateGuard"
    return FOCUSRow(
        charge_period_start=_iso_utc(c.window_start_unix),
        charge_period_end=_iso_utc(c.window_end_unix),
        charge_category="Usage",
        charge_description=desc,
        billed_cost=0.0,
        effective_cost=c.estimated_cost_micro_usd / 1e6,
        billing_currency="USD",
        provider_name=c.provider,
        service_name="LLM Inference",
        service_category="AI and Machine Learning",
        resource_id=c.key,
        sku_id=c.model,
        consumed_quantity=float(c.total_tokens),
        consumed_unit="tokens",
        x_input_tokens=c.input_tokens,
        x_output_tokens=c.output_tokens,
        x_policy_preset=c.policy_preset,
        x_attestation_token_id=c.attestation_token_id,
        x_receipt_signature=base64.b64encode(receipt.signature).decode() if receipt.signature else "",
    )


def _fmt(value: float) -> str:
    # Mirrors Go's %g so the three SDKs emit identical CSV cells.
    return f"{value:g}"


def write_focus_csv(stream: IO[str], rows: list[FOCUSRow]) -> None:
    """Write a header plus one line per row."""
    # lineterminator matches Go's encoding/csv default (\n) so all three
    # SDKs emit byte-identical exports for identical rows.
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(FOCUS_HEADER)
    for r in rows:
        writer.writerow(
            [
                r.charge_period_start, r.charge_period_end, r.charge_category, r.charge_description,
                _fmt(r.billed_cost), _fmt(r.effective_cost), r.billing_currency,
                r.provider_name, r.service_name, r.service_category,
                r.resource_id, r.sku_id, _fmt(r.consumed_quantity), r.consumed_unit,
                str(r.x_input_tokens), str(r.x_output_tokens),
                r.x_policy_preset, r.x_attestation_token_id,
                r.x_receipt_signature,
            ]
        )
