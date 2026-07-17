"""Evidence chain: hash linking, tamper detection, external signers, and the
evidence package — mirrors Go's evidence_chain_test.go."""

from __future__ import annotations

import json
import threading

import pytest

from rateguard import (
    GENESIS_PREV_HASH,
    EvidenceChain,
    EvidencePackage,
    KeySigner,
    SpendReceipt,
    SpendReceiptClaims,
    issue_spend_receipt,
    issue_spend_receipt_with_signer,
    verify_evidence_chain,
    verify_evidence_package,
    verify_spend_receipt,
)
from rateguard.core.budget_attestation import private_key_from_raw

ISSUED_AT = 1_700_000_000
EXPORTED_AT = 1_700_010_000


def key_from_seed_byte(b: int) -> tuple:
    priv = private_key_from_raw(bytes([b]) * 32)
    return priv, priv.public_key().public_bytes_raw()


def make_claims(tokens: int, cost_micro_usd: int) -> SpendReceiptClaims:
    return SpendReceiptClaims(
        key="agent-1",
        provider="openai",
        model="gpt-4o",
        window_start_unix=1_700_000_000,
        window_end_unix=1_700_003_600,
        input_tokens=tokens // 2,
        output_tokens=tokens - tokens // 2,
        total_tokens=tokens,
        estimated_cost_micro_usd=cost_micro_usd,
    )


def chain_of(n: int) -> tuple[EvidenceChain, bytes, object]:
    """Build a chain of n receipts signed by a fixed key."""
    priv, pub = key_from_seed_byte(1)
    chain = EvidenceChain()
    for i in range(n):
        chain.append(issue_spend_receipt(priv, make_claims(100 * (i + 1), 1000 * (i + 1)), ISSUED_AT))
    return chain, pub, priv


# ── Linking ──


def test_chain_links_and_verifies() -> None:
    chain, pub, _ = chain_of(4)
    assert len(chain) == 4

    entries = chain.entries()
    assert entries[0].prev_hash == GENESIS_PREV_HASH
    for i in range(1, len(entries)):
        assert entries[i].prev_hash == entries[i - 1].entry_hash
        assert entries[i].seq == i
    assert chain.head == entries[-1].entry_hash
    verify_evidence_chain(pub, entries, chain.head)


def test_empty_chain_heads_at_genesis_and_cannot_export() -> None:
    c = EvidenceChain()
    assert c.head == GENESIS_PREV_HASH
    verify_evidence_chain(None, c.entries(), GENESIS_PREV_HASH)
    with pytest.raises(ValueError, match="empty evidence chain"):
        c.export_evidence()


def test_chain_refuses_unverifiable_receipt() -> None:
    priv, _ = key_from_seed_byte(1)
    r = issue_spend_receipt(priv, make_claims(100, 1000), ISSUED_AT)
    # Claims are frozen; rebuild with a claim the signature does not cover.
    tampered = SpendReceipt(
        claims=make_claims(999_999, 1000),
        issued_at_unix=r.issued_at_unix,
        issuer_public_key=r.issuer_public_key,
        signature=r.signature,
    )
    c = EvidenceChain()
    with pytest.raises(ValueError, match="unverifiable receipt"):
        c.append(tampered)
    assert len(c) == 0


def test_chain_concurrent_append() -> None:
    priv, _ = key_from_seed_byte(1)
    c = EvidenceChain()
    n = 50
    errors: list[Exception] = []

    def worker(i: int) -> None:
        try:
            c.append(issue_spend_receipt(priv, make_claims(i + 1, i + 1), ISSUED_AT))
        except Exception as exc:  # pragma: no cover — a failure fails the test
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    # Interleaved appends must still produce ONE unbroken chain.
    assert len(c) == n
    verify_evidence_chain(None, c.entries(), c.head)


# ── Tamper detection ──


def test_chain_detects_deleted_entry() -> None:
    # The attack the chain exists to catch: drop an expensive receipt from the
    # middle. Every REMAINING receipt still has a valid signature — only the
    # links expose the deletion.
    chain, pub, _ = chain_of(4)
    entries = chain.entries()
    for e in entries:
        verify_spend_receipt(pub, e.receipt)

    doctored = entries[:2] + entries[3:]
    with pytest.raises(ValueError, match="seq|chain broken"):
        verify_evidence_chain(pub, doctored)


def test_chain_detects_reordered_entries() -> None:
    chain, pub, _ = chain_of(3)
    e = chain.entries()
    with pytest.raises(ValueError):
        verify_evidence_chain(pub, [e[1], e[0], e[2]])


def test_chain_detects_altered_claim() -> None:
    # Altering a claim breaks the receipt signature before the hash is even
    # consulted — asserted so the two layers stay independently effective.
    chain, pub, _ = chain_of(3)
    entries = chain.entries()
    bad = entries[1]
    entries[1] = type(bad)(
        seq=bad.seq,
        prev_hash=bad.prev_hash,
        receipt=SpendReceipt(
            claims=make_claims(bad.receipt.claims.total_tokens, 1),
            issued_at_unix=bad.receipt.issued_at_unix,
            issuer_public_key=bad.receipt.issuer_public_key,
            signature=bad.receipt.signature,
        ),
        entry_hash=bad.entry_hash,
    )
    with pytest.raises(ValueError, match="signature"):
        verify_evidence_chain(pub, entries)


def test_chain_detects_rewritten_hash() -> None:
    chain, pub, _ = chain_of(3)
    entries = chain.entries()
    bad = entries[2]
    entries[2] = type(bad)(
        seq=bad.seq,
        prev_hash=bad.prev_hash,
        receipt=bad.receipt,
        entry_hash="ab" * 32,
    )
    with pytest.raises(ValueError, match="hash mismatch"):
        verify_evidence_chain(pub, entries)


def test_witnessed_head_catches_wholesale_rewrite() -> None:
    # The want_head check is what catches a WHOLESALE rewrite: an issuer
    # holding the key rebuilds an internally-consistent chain, and only a head
    # recorded externally exposes it. This is the property the docs hang the
    # "witness the head" instruction on, so it gets a test.
    chain, pub, priv = chain_of(3)
    witnessed_head = chain.head

    rebuilt = EvidenceChain()
    for i in range(2):  # the expensive third receipt quietly omitted
        rebuilt.append(issue_spend_receipt(priv, make_claims(100 * (i + 1), 1000 * (i + 1)), ISSUED_AT))

    # The rebuilt chain is internally flawless — that is the point.
    verify_evidence_chain(pub, rebuilt.entries())
    # Only the externally-witnessed head exposes it.
    with pytest.raises(ValueError, match="head"):
        verify_evidence_chain(pub, rebuilt.entries(), witnessed_head)


def test_chain_pins_issuer() -> None:
    chain, _, _ = chain_of(2)
    _, other_pub = key_from_seed_byte(7)
    # A chain signed by an attacker's own key is internally valid; pinning is
    # the only thing that rejects it.
    verify_evidence_chain(None, chain.entries())
    with pytest.raises(ValueError, match="trusted issuer"):
        verify_evidence_chain(other_pub, chain.entries())


# ── Signer ──


class _FailingSigner:
    """A KMS that is down or denies the request."""

    def __init__(self, pub: bytes) -> None:
        self._pub = pub

    def public_key(self) -> bytes:
        return self._pub

    def sign(self, payload: bytes) -> bytes:
        raise RuntimeError("kms unavailable")


class _WrongKeySigner:
    """A KMS pointed at the wrong alias: advertises one key, signs with another."""

    def __init__(self, pub: bytes, priv: object) -> None:
        self._pub = pub
        self._priv = priv

    def public_key(self) -> bytes:
        return self._pub

    def sign(self, payload: bytes) -> bytes:
        return self._priv.sign(payload)  # type: ignore[attr-defined]


class _ShortSigner:
    def __init__(self, pub: bytes) -> None:
        self._pub = pub

    def public_key(self) -> bytes:
        return self._pub

    def sign(self, payload: bytes) -> bytes:
        return b"\x00" * 10


def test_key_signer_matches_direct_issue() -> None:
    priv, pub = key_from_seed_byte(1)
    claims = make_claims(100, 1000)

    direct = issue_spend_receipt(priv, claims, ISSUED_AT)
    via_signer = issue_spend_receipt_with_signer(KeySigner(priv), claims, ISSUED_AT)

    # Ed25519 is deterministic: the same key over the same payload must produce
    # the same signature. The signer path is a routing change, not a format one.
    assert via_signer.signature == direct.signature
    verify_spend_receipt(pub, via_signer)


def test_signer_failure_surfaces() -> None:
    _, pub = key_from_seed_byte(1)
    with pytest.raises(ValueError, match="kms unavailable"):
        issue_spend_receipt_with_signer(_FailingSigner(pub), make_claims(100, 1000), ISSUED_AT)


def test_signer_with_mismatched_key_rejected() -> None:
    # A KMS signing with a key other than the one it advertises would mint
    # receipts that fail verification later, in an auditor's hands. Catch it at
    # issue time instead.
    _, pub = key_from_seed_byte(1)
    other_priv, _ = key_from_seed_byte(9)
    with pytest.raises(ValueError, match="does not verify"):
        issue_spend_receipt_with_signer(_WrongKeySigner(pub, other_priv), make_claims(100, 1000), ISSUED_AT)


def test_signer_short_signature_rejected() -> None:
    _, pub = key_from_seed_byte(1)
    with pytest.raises(ValueError, match="10-byte signature"):
        issue_spend_receipt_with_signer(_ShortSigner(pub), make_claims(100, 1000), ISSUED_AT)


def test_signer_bad_public_key_rejected() -> None:
    with pytest.raises(ValueError, match="32 bytes"):
        issue_spend_receipt_with_signer(_ShortSigner(b"\x00" * 8), make_claims(100, 1000), ISSUED_AT)


# ── Evidence package ──


def test_package_exports_and_verifies() -> None:
    chain, pub, _ = chain_of(3)
    pkg = chain.export_evidence(EXPORTED_AT)

    assert pkg.entry_count == 3
    assert len(pkg.entries) == 3
    assert pkg.chain_head == chain.head
    # 100 + 200 + 300 tokens, 1000 + 2000 + 3000 micro-USD.
    assert pkg.total_tokens == 600
    assert pkg.total_estimated_cost_micro_usd == 6000
    assert pkg.caveats
    verify_evidence_package(pub, pkg)


def test_package_round_trips_through_json() -> None:
    chain, pub, _ = chain_of(3)
    pkg = chain.export_evidence(EXPORTED_AT)

    # The package is a file that travels; it must verify after a round trip
    # through JSON, or the export is decorative.
    decoded = EvidencePackage.from_dict(json.loads(pkg.to_json()))
    verify_evidence_package(pub, decoded)
    assert decoded.chain_head == pkg.chain_head
    assert decoded.total_tokens == pkg.total_tokens


def test_package_detects_edited_totals() -> None:
    # Totals are what an assessor reads. Editing them without touching a
    # receipt must fail, or the summary is a place to hide spend.
    chain, pub, _ = chain_of(3)
    pkg = chain.export_evidence(EXPORTED_AT)

    orig = pkg.total_estimated_cost_micro_usd
    pkg.total_estimated_cost_micro_usd = 1
    with pytest.raises(ValueError, match="micro-USD"):
        verify_evidence_package(pub, pkg)
    pkg.total_estimated_cost_micro_usd = orig

    pkg.total_tokens = 1
    with pytest.raises(ValueError, match="total tokens"):
        verify_evidence_package(pub, pkg)


def test_package_rejects_malformed() -> None:
    chain, pub, _ = chain_of(2)

    bad_version = chain.export_evidence(EXPORTED_AT)
    bad_version.v = "something-else/9"
    with pytest.raises(ValueError, match="unsupported evidence package"):
        verify_evidence_package(pub, bad_version)

    miscount = chain.export_evidence(EXPORTED_AT)
    miscount.entry_count = 99
    with pytest.raises(ValueError, match="carries"):
        verify_evidence_package(pub, miscount)

    rewritten = chain.export_evidence(EXPORTED_AT)
    rewritten.chain_head = "cd" * 32
    with pytest.raises(ValueError, match="head"):
        verify_evidence_package(pub, rewritten)
