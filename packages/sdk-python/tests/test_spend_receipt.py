"""Spend receipts + FOCUS export — mirrors Go's spend_receipt_test.go,
including the byte-exact conformance vectors against the Go reference."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

import pytest

from rateguard import (
    SpendReceipt,
    SpendReceiptClaims,
    focus_row_from_receipt,
    issue_spend_receipt,
    receipt_signing_payload,
    verify_spend_receipt,
    write_focus_csv,
)
from rateguard.core.budget_attestation import private_key_from_raw

VECTORS = Path(__file__).resolve().parents[3] / "conformance" / "spend_receipt_vectors.json"


def signing_key():
    return private_key_from_raw(bytes(range(32)))


def sample_claims() -> SpendReceiptClaims:
    return SpendReceiptClaims(
        key="tenant-a:agent-7",
        provider="openai",
        model="gpt-4o",
        window_start_unix=1_780_000_000,
        window_end_unix=1_780_003_600,
        input_tokens=120_000,
        output_tokens=34_500,
        total_tokens=154_500,
        estimated_cost_micro_usd=645_000,
        policy_preset="agent-orchestrator",
        attestation_token_id="att-9f2c",
    )


def test_issue_verify_roundtrip_including_dict_transport() -> None:
    priv = signing_key()
    r = issue_spend_receipt(priv, sample_claims())
    pub = priv.public_key().public_bytes_raw()
    verify_spend_receipt(pub, r)

    back = SpendReceipt.from_dict(json.loads(json.dumps(r.to_dict())))
    verify_spend_receipt(pub, back)


def test_tamper_detection() -> None:
    priv = signing_key()
    r = issue_spend_receipt(priv, sample_claims())
    pub = priv.public_key().public_bytes_raw()

    tampered = SpendReceipt(
        claims=SpendReceiptClaims(**{**sample_claims().__dict__, "total_tokens": 1}),
        issued_at_unix=r.issued_at_unix,
        issuer_public_key=r.issuer_public_key,
        signature=r.signature,
    )
    with pytest.raises(ValueError):
        verify_spend_receipt(pub, tampered)

    with pytest.raises(ValueError):
        verify_spend_receipt(
            pub,
            SpendReceipt(r.claims, r.issued_at_unix + 1, r.issuer_public_key, r.signature),
        )

    other = private_key_from_raw(bytes([7] * 32)).public_key().public_bytes_raw()
    with pytest.raises(ValueError):
        verify_spend_receipt(other, r)

    # Integrity-only mode: untampered passes, tampered still fails.
    verify_spend_receipt(None, r)
    with pytest.raises(ValueError):
        verify_spend_receipt(
            None,
            SpendReceipt(
                SpendReceiptClaims(**{**sample_claims().__dict__, "key": "someone-else"}),
                r.issued_at_unix,
                r.issuer_public_key,
                r.signature,
            ),
        )


def test_claim_validation() -> None:
    priv = signing_key()
    with pytest.raises(ValueError):
        issue_spend_receipt(priv, SpendReceiptClaims(key="", window_start_unix=0, window_end_unix=1))
    with pytest.raises(ValueError):
        issue_spend_receipt(priv, SpendReceiptClaims(key="k", window_start_unix=5, window_end_unix=5))
    with pytest.raises(ValueError):
        issue_spend_receipt(
            priv,
            SpendReceiptClaims(key="k", window_start_unix=0, window_end_unix=1, estimated_cost_micro_usd=-1),
        )


def test_conformance_vectors_byte_exact_with_go_reference() -> None:
    v = json.loads(VECTORS.read_text())
    priv = private_key_from_raw(bytes.fromhex(v["seed_hex"]))
    pub = priv.public_key().public_bytes_raw()

    claims = SpendReceiptClaims(
        key=v["claims"]["key"],
        provider=v["claims"].get("provider", ""),
        model=v["claims"].get("model", ""),
        window_start_unix=v["claims"]["window_start_unix"],
        window_end_unix=v["claims"]["window_end_unix"],
        input_tokens=v["claims"]["input_tokens"],
        output_tokens=v["claims"]["output_tokens"],
        total_tokens=v["claims"]["total_tokens"],
        estimated_cost_micro_usd=v["claims"]["estimated_cost_micro_usd"],
        policy_preset=v["claims"].get("policy_preset", ""),
        attestation_token_id=v["claims"].get("attestation_token_id", ""),
    )

    payload = receipt_signing_payload(claims, v["issued_at_unix"], pub)
    assert payload.decode() == v["payload"], "signing payload diverges from the Go reference"

    r = issue_spend_receipt(priv, claims, issued_at_unix=v["issued_at_unix"])
    assert r.signature.hex() == v["signature_hex"], "signature diverges from the Go reference"
    verify_spend_receipt(pub, r)


def test_focus_export() -> None:
    priv = signing_key()
    r = issue_spend_receipt(priv, sample_claims(), issued_at_unix=1_780_003_700)

    out = io.StringIO()
    write_focus_csv(out, [focus_row_from_receipt(r)])
    records = list(csv.reader(io.StringIO(out.getvalue())))
    assert len(records) == 2

    header, row = records
    cell = dict(zip(header, row, strict=True))
    assert cell["EffectiveCost"] == "0.645"
    assert cell["BilledCost"] == "0"
    assert cell["ConsumedQuantity"] == "154500"
    assert cell["ConsumedUnit"] == "tokens"
    assert cell["ChargePeriodStart"] == "2026-05-28T20:26:40Z"
    assert cell["ServiceCategory"] == "AI and Machine Learning"
    assert cell["x_rateguard_input_tokens"] == "120000"
    assert cell["x_rateguard_receipt_signature"] != ""
