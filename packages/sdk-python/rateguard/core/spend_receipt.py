"""Spend Receipts — signed proof of what was actually spent.

Budget attestation answers "was this agent AUTHORIZED to spend?"; a spend
receipt answers the other half: "what DID it spend?" — an Ed25519-signed,
offline-verifiable statement that a key consumed N tokens at an estimated
cost over a window. Together: grant → spend → proof. Binding a receipt to
the attestation chain that authorized the spend is the
``attestation_token_id`` field (groundwork — full chain binding lands
with attestation v2).

Receipts are caller-fed primitives: the caller supplies the claims (from
its own metering) and a signing key it controls. RateGuard holds no
signing keys.

Cross-language discipline (the budget-attestation lesson): the signing
payload contains ONLY integers and strings — unix seconds for time,
integer micro-USD for money. conformance/spend_receipt_vectors.json pins
payload and signature byte-for-byte against the Go reference.
"""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from .budget_attestation import _ed25519, private_key_from_raw  # noqa: F401 — shared lazy import pattern

if TYPE_CHECKING:  # pragma: no cover
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

_RECEIPT_VERSION = "rateguard-spend-receipt/1"


@dataclass(frozen=True)
class SpendReceiptClaims:
    """The statement a receipt signs.

    window bounds are unix seconds UTC: [start, end).
    estimated_cost_micro_usd is integer micro-USD (1 USD = 1_000_000) —
    an estimate from the pricing table, not a provider invoice.
    """

    key: str
    window_start_unix: int
    window_end_unix: int
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_micro_usd: int = 0
    provider: str = ""
    model: str = ""
    policy_preset: str = ""
    attestation_token_id: str = ""

    def validate(self) -> None:
        if not self.key:
            raise ValueError("rateguard: receipt claims need a key")
        if self.window_end_unix <= self.window_start_unix:
            raise ValueError(
                f"rateguard: receipt window end ({self.window_end_unix}) must be after start ({self.window_start_unix})"
            )
        if min(self.input_tokens, self.output_tokens, self.total_tokens, self.estimated_cost_micro_usd) < 0:
            raise ValueError("rateguard: receipt token/cost claims must be non-negative")


@dataclass(frozen=True)
class SpendReceipt:
    """A signed SpendReceiptClaims. issuer_public_key is raw 32 bytes."""

    claims: SpendReceiptClaims
    issued_at_unix: int
    issuer_public_key: bytes
    signature: bytes

    def to_dict(self) -> dict[str, Any]:
        """JSON-transport shape (bytes as base64), mirrors Go's json tags."""
        claims: dict[str, Any] = {
            "key": self.claims.key,
            "window_start_unix": self.claims.window_start_unix,
            "window_end_unix": self.claims.window_end_unix,
            "input_tokens": self.claims.input_tokens,
            "output_tokens": self.claims.output_tokens,
            "total_tokens": self.claims.total_tokens,
            "estimated_cost_micro_usd": self.claims.estimated_cost_micro_usd,
        }
        for name in ("provider", "model", "policy_preset", "attestation_token_id"):
            value = getattr(self.claims, name)
            if value:
                claims[name] = value
        return {
            "claims": claims,
            "issued_at_unix": self.issued_at_unix,
            "issuer_public_key": base64.b64encode(self.issuer_public_key).decode(),
            "signature": base64.b64encode(self.signature).decode(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SpendReceipt":
        c = data["claims"]
        return cls(
            claims=SpendReceiptClaims(
                key=str(c["key"]),
                window_start_unix=int(c["window_start_unix"]),
                window_end_unix=int(c["window_end_unix"]),
                input_tokens=int(c.get("input_tokens", 0)),
                output_tokens=int(c.get("output_tokens", 0)),
                total_tokens=int(c.get("total_tokens", 0)),
                estimated_cost_micro_usd=int(c.get("estimated_cost_micro_usd", 0)),
                provider=str(c.get("provider", "")),
                model=str(c.get("model", "")),
                policy_preset=str(c.get("policy_preset", "")),
                attestation_token_id=str(c.get("attestation_token_id", "")),
            ),
            issued_at_unix=int(data["issued_at_unix"]),
            issuer_public_key=base64.b64decode(data["issuer_public_key"]),
            signature=base64.b64decode(data["signature"]),
        )


def _public_raw(key: "Ed25519PrivateKey") -> bytes:
    return key.public_key().public_bytes_raw()


def receipt_signing_payload(claims: SpendReceiptClaims, issued_at_unix: int, issuer_public_raw: bytes) -> bytes:
    """Canonical signing bytes. Key order and compact separators MUST match
    Go's json.Marshal of its fixed-field struct byte-for-byte (asserted by
    the conformance vectors)."""
    payload = {
        "v": _RECEIPT_VERSION,
        "key": claims.key,
        "provider": claims.provider,
        "model": claims.model,
        "window_start_unix": claims.window_start_unix,
        "window_end_unix": claims.window_end_unix,
        "input_tokens": claims.input_tokens,
        "output_tokens": claims.output_tokens,
        "total_tokens": claims.total_tokens,
        "estimated_cost_micro_usd": claims.estimated_cost_micro_usd,
        "policy_preset": claims.policy_preset,
        "attestation_token_id": claims.attestation_token_id,
        "issued_at_unix": issued_at_unix,
        "issuer_public_key": base64.b64encode(issuer_public_raw).decode(),
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def issue_spend_receipt(
    issuer_private_key: "Ed25519PrivateKey",
    claims: SpendReceiptClaims,
    issued_at_unix: int | None = None,
) -> SpendReceipt:
    """Sign claims with the issuer's key. issued_at_unix defaults to now;
    pass it explicitly for deterministic tests and conformance vectors."""
    claims.validate()
    issued = int(time.time()) if issued_at_unix is None else int(issued_at_unix)
    pub = _public_raw(issuer_private_key)
    payload = receipt_signing_payload(claims, issued, pub)
    return SpendReceipt(
        claims=claims,
        issued_at_unix=issued,
        issuer_public_key=pub,
        signature=issuer_private_key.sign(payload),
    )


def verify_spend_receipt(trusted_issuer_raw: bytes | None, receipt: SpendReceipt) -> None:
    """Check the receipt's signature and claim sanity. trusted_issuer_raw
    pins the raw 32-byte public key the caller trusts; None skips pinning
    and proves only integrity under the EMBEDDED key — enough for tamper
    detection, NOT authenticity. Raises ValueError on any failure."""
    if len(receipt.issuer_public_key) != 32:
        raise ValueError("rateguard: receipt issuer key must be 32 bytes")
    if trusted_issuer_raw is not None and bytes(trusted_issuer_raw) != bytes(receipt.issuer_public_key):
        raise ValueError("rateguard: receipt issuer key does not match the trusted issuer")
    receipt.claims.validate()
    payload = receipt_signing_payload(receipt.claims, receipt.issued_at_unix, receipt.issuer_public_key)
    ed = _ed25519()
    public_key = ed.Ed25519PublicKey.from_public_bytes(bytes(receipt.issuer_public_key))
    try:
        public_key.verify(receipt.signature, payload)
    except Exception as exc:
        raise ValueError("rateguard: receipt signature verification failed") from exc
