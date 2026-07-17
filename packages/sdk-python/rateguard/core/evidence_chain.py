"""Evidence Chain — tamper-evident spend history.

A signed receipt (spend_receipt.py) proves a single statement was not
altered. It proves nothing about the SET of statements: an issuer holding its
own key can drop the expensive receipts, renumber what is left, and re-sign a
tidier history. Every individual receipt still verifies.

An evidence chain closes that hole. Each entry commits to the hash of the
entry before it, so the log is append-only in a checkable way: remove or
reorder an entry and every subsequent hash fails to recompute. What the chain
yields is a single head hash standing for the entire history.

── What this does and does not prove (read before marketing it) ──

The chain makes SELECTIVE edits detectable. It does not, by itself, make
wholesale rewriting detectable: an issuer with its own signing key can rebuild
the chain from entry zero and publish a new head. Two things are required
before the word "evidence" is honest, and RateGuard cannot supply either from
inside your process:

 1. The signing key must live somewhere the application cannot read — a KMS or
    HSM. That is what the Signer protocol is for: implement it against your
    KMS and RateGuard never sees key material. A key the audited process holds
    cannot produce independently verifiable logs, which is precisely the bar
    EU AI Act Art. 12 record-keeping sets.
 2. The head must be witnessed outside the application — published,
    timestamped, or written to append-only storage on a cadence. A head nobody
    recorded is a head you can silently replace.

With both, this produces the audit INPUTS an assessor can work from. RateGuard
ships components for an evidence trail. It does not make a deployment
compliant, and nothing here should be sold as if it did.

Cross-language discipline: the hashed payload contains ONLY integers and
strings, so Go, Node, and Python produce identical bytes.
"""

from __future__ import annotations

import base64
import hashlib
import json
import threading
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

from .spend_receipt import (
    SpendReceipt,
    SpendReceiptClaims,
    receipt_signing_payload,
    verify_spend_receipt,
)

if TYPE_CHECKING:  # pragma: no cover
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

_EVIDENCE_CHAIN_VERSION = "rateguard-evidence-chain/1"

#: The prev_hash of entry 0: 32 zero bytes as hex. A fixed-width sentinel
#: rather than an empty string keeps the hashed payload one shape for every
#: entry, so all three SDKs agree.
GENESIS_PREV_HASH = "0" * 64


class Signer(Protocol):
    """Signs bytes with a key the caller controls.

    Implement this against a KMS/HSM so the private key never enters the
    process: ``sign`` ships the payload to the external signer and returns the
    signature. ``public_key`` returns the raw 32-byte Ed25519 public key the
    signature verifies under — the key auditors pin.

    For development, or where an in-process key is genuinely acceptable,
    :class:`KeySigner` wraps an Ed25519PrivateKey. Be deliberate about that
    choice: an in-process key is what disqualifies a log from being
    independently verifiable.
    """

    def public_key(self) -> bytes: ...

    def sign(self, payload: bytes) -> bytes: ...


class KeySigner:
    """Adapts a raw Ed25519 private key to :class:`Signer`.

    The key stays in process memory — see the Signer docs on why that limits
    what the resulting chain proves.
    """

    def __init__(self, private_key: "Ed25519PrivateKey") -> None:
        self._private_key = private_key
        self._public = private_key.public_key().public_bytes_raw()

    def public_key(self) -> bytes:
        return self._public

    def sign(self, payload: bytes) -> bytes:
        return self._private_key.sign(payload)


def issue_spend_receipt_with_signer(
    signer: Signer,
    claims: SpendReceiptClaims,
    issued_at_unix: int | None = None,
) -> SpendReceipt:
    """Sign claims through a :class:`Signer`, so the private key can live in a
    KMS the process cannot read. Otherwise identical to issue_spend_receipt.
    """
    pub = signer.public_key()
    if len(pub) != 32:
        raise ValueError("rateguard: signer public key must be 32 bytes")
    claims.validate()
    issued = int(time.time()) if issued_at_unix is None else int(issued_at_unix)
    payload = receipt_signing_payload(claims, issued, pub)
    try:
        signature = signer.sign(payload)
    except Exception as exc:
        raise ValueError(f"rateguard: signer failed: {exc}") from exc
    if len(signature) != 64:
        raise ValueError(
            f"rateguard: signer returned a {len(signature)}-byte signature, want 64"
        )
    receipt = SpendReceipt(
        claims=claims,
        issued_at_unix=issued,
        issuer_public_key=pub,
        signature=signature,
    )
    # A KMS misconfigured to a different key produces a signature that verifies
    # under nothing we advertise. Catching it here beats handing an auditor a
    # chain that fails months later.
    try:
        verify_spend_receipt(pub, receipt)
    except ValueError as exc:
        raise ValueError(
            f"rateguard: signer's signature does not verify under its own public key: {exc}"
        ) from exc
    return receipt


@dataclass(frozen=True)
class EvidenceChainEntry:
    """One link: a receipt, its position, and the hashes binding it to the
    entry before it.

    ``seq`` is the 0-based position; gaps are a broken chain. ``prev_hash`` is
    the previous entry's ``entry_hash``, hex; entry 0 carries
    GENESIS_PREV_HASH. ``entry_hash`` is hex SHA-256 over this entry's
    canonical payload.
    """

    seq: int
    prev_hash: str
    receipt: SpendReceipt
    entry_hash: str

    def to_dict(self) -> dict[str, Any]:
        """JSON-transport shape, mirrors Go's json tags."""
        return {
            "seq": self.seq,
            "prev_hash": self.prev_hash,
            "receipt": self.receipt.to_dict(),
            "entry_hash": self.entry_hash,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EvidenceChainEntry":
        return cls(
            seq=int(data["seq"]),
            prev_hash=str(data["prev_hash"]),
            receipt=SpendReceipt.from_dict(data["receipt"]),
            entry_hash=str(data["entry_hash"]),
        )


def _entry_hash_payload(seq: int, prev_hash: str, receipt_signature: bytes) -> bytes:
    """The bytes an entry's hash covers.

    The receipt is represented by its SIGNATURE, not by its claims. The
    signature already covers every claim, the issue time, and the issuer key,
    so hashing it binds all of them transitively while keeping this payload to
    integers and strings — the same discipline the receipt payload follows,
    and the reason all three SDKs produce identical bytes.
    """
    payload = {
        "v": _EVIDENCE_CHAIN_VERSION,
        "seq": seq,
        "prev_hash": prev_hash,
        "receipt_signature": base64.b64encode(receipt_signature).decode(),
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def _compute_entry_hash(seq: int, prev_hash: str, receipt_signature: bytes) -> str:
    return hashlib.sha256(_entry_hash_payload(seq, prev_hash, receipt_signature)).hexdigest()


def _evidence_package_caveats() -> list[str]:
    """What the package cannot prove.

    Ships inside the export deliberately: an evidence file that outlives its
    context gets read as proof of more than it is.
    """
    return [
        "Costs are RateGuard estimates from its pricing table, not provider invoices. Reconcile against billing; expect drift.",
        "Signatures prove integrity under the issuer key. They establish authenticity only if that key was pinned from an independent source.",
        "If the issuer key lived inside the audited application, this log is not independently verifiable: the application could have rebuilt it. External KMS/HSM signing is required for that claim.",
        "The chain head proves no selective edit only if the head was witnessed outside the audited system before this export.",
    ]


@dataclass
class EvidencePackage:
    """A self-contained export of a chain: the entries, the head they produce,
    the issuer key to verify under, and totals an assessor can reconcile
    against a provider invoice.

    ``issuer_public_key`` is base64 raw 32 bytes — the key to pin. Publish it
    somewhere an auditor can fetch independently of this file.
    ``total_estimated_cost_micro_usd`` is RateGuard's ESTIMATE from its pricing
    table, never a provider invoice.
    """

    v: str
    exported_at_unix: int
    issuer_public_key: str
    chain_head: str
    entry_count: int
    entries: list[EvidenceChainEntry]
    total_tokens: int
    total_estimated_cost_micro_usd: int
    caveats: list[str] = field(default_factory=_evidence_package_caveats)

    def to_dict(self) -> dict[str, Any]:
        """JSON-transport shape, mirrors Go's json tags."""
        return {
            "v": self.v,
            "exported_at_unix": self.exported_at_unix,
            "issuer_public_key": self.issuer_public_key,
            "chain_head": self.chain_head,
            "entry_count": self.entry_count,
            "entries": [e.to_dict() for e in self.entries],
            "total_tokens": self.total_tokens,
            "total_estimated_cost_micro_usd": self.total_estimated_cost_micro_usd,
            "caveats": list(self.caveats),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EvidencePackage":
        return cls(
            v=str(data["v"]),
            exported_at_unix=int(data["exported_at_unix"]),
            issuer_public_key=str(data["issuer_public_key"]),
            chain_head=str(data["chain_head"]),
            entry_count=int(data["entry_count"]),
            entries=[EvidenceChainEntry.from_dict(e) for e in data.get("entries", [])],
            total_tokens=int(data.get("total_tokens", 0)),
            total_estimated_cost_micro_usd=int(data.get("total_estimated_cost_micro_usd", 0)),
            caveats=[str(c) for c in data.get("caveats", [])],
        )

    def to_json(self) -> str:
        """Render as indented JSON — the artifact to hand an assessor or archive."""
        return json.dumps(self.to_dict(), indent=2)


class EvidenceChain:
    """An append-only, hash-linked log of spend receipts. Safe for concurrent use.

    The chain holds every entry in memory and grows without bound — it is a
    record, not a cache, and silently dropping the oldest entries would make
    the head unverifiable. Export and persist on a cadence that matches your
    retention needs.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: list[EvidenceChainEntry] = []
        self._head = GENESIS_PREV_HASH

    def append(self, receipt: SpendReceipt) -> EvidenceChainEntry:
        """Link a receipt onto the chain and return the entry created.

        The receipt's signature is verified under its own embedded key first:
        an unverifiable receipt must never enter the chain, because the chain's
        whole value is that every link holds.
        """
        try:
            verify_spend_receipt(None, receipt)
        except ValueError as exc:
            raise ValueError(f"rateguard: refusing to chain an unverifiable receipt: {exc}") from exc

        with self._lock:
            seq = len(self._entries)
            entry = EvidenceChainEntry(
                seq=seq,
                prev_hash=self._head,
                receipt=receipt,
                entry_hash=_compute_entry_hash(seq, self._head, receipt.signature),
            )
            self._entries.append(entry)
            self._head = entry.entry_hash
            return entry

    @property
    def head(self) -> str:
        """The hash of the last entry, or the genesis sentinel when empty.

        This single value stands for the whole history: witness it externally
        (publish it, timestamp it, write it to append-only storage) or the
        chain proves only that nobody edited a log they could have rebuilt.
        """
        with self._lock:
            return self._head

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)

    def entries(self) -> list[EvidenceChainEntry]:
        """A copy of the chain, oldest first."""
        with self._lock:
            return list(self._entries)

    def export_evidence(self, exported_at_unix: int | None = None) -> EvidencePackage:
        """Build an :class:`EvidencePackage` over the whole chain."""
        entries = self.entries()
        if not entries:
            raise ValueError("rateguard: cannot export an empty evidence chain")
        total_tokens = sum(e.receipt.claims.total_tokens for e in entries)
        total_cost = sum(e.receipt.claims.estimated_cost_micro_usd for e in entries)
        return EvidencePackage(
            v=_EVIDENCE_CHAIN_VERSION,
            exported_at_unix=int(time.time()) if exported_at_unix is None else int(exported_at_unix),
            issuer_public_key=base64.b64encode(entries[0].receipt.issuer_public_key).decode(),
            chain_head=self.head,
            entry_count=len(entries),
            entries=entries,
            total_tokens=total_tokens,
            total_estimated_cost_micro_usd=total_cost,
        )


def verify_evidence_chain(
    trusted_issuer_raw: bytes | None,
    entries: list[EvidenceChainEntry],
    want_head: str = "",
) -> None:
    """Check a chain end to end: every receipt signature, every hash link, and
    the sequence numbering. Raises ValueError on the first failure.

    ``trusted_issuer_raw`` pins the raw 32-byte public key the caller trusts.
    Pass None to check only integrity under each receipt's embedded key —
    enough to detect tampering, NOT enough to establish authenticity, since
    anyone can mint a keypair and sign a whole chain with it.

    ``want_head``, when non-empty, asserts the chain ends at a head recorded
    earlier. This is the check that catches a wholesale rewrite, and it only
    means something if want_head came from outside the audited system.
    """
    prev = GENESIS_PREV_HASH
    for i, entry in enumerate(entries):
        if entry.seq != i:
            raise ValueError(
                f"rateguard: chain entry {i} claims seq {entry.seq} (entries missing or reordered)"
            )
        if entry.prev_hash != prev:
            raise ValueError(
                f"rateguard: chain broken at seq {entry.seq}: prev_hash {entry.prev_hash} "
                f"does not match the previous entry's hash {prev}"
            )
        try:
            verify_spend_receipt(trusted_issuer_raw, entry.receipt)
        except ValueError as exc:
            raise ValueError(f"rateguard: chain entry {entry.seq}: {exc}") from exc
        want = _compute_entry_hash(entry.seq, entry.prev_hash, entry.receipt.signature)
        if entry.entry_hash != want:
            raise ValueError(
                f"rateguard: chain entry {entry.seq} hash mismatch: recorded {entry.entry_hash}, "
                f"recomputed {want} (the entry was altered)"
            )
        prev = entry.entry_hash
    if want_head and prev != want_head:
        raise ValueError(
            f"rateguard: chain head is {prev}, expected {want_head} "
            f"(entries appended, dropped, or replaced since that head was recorded)"
        )


def verify_evidence_package(trusted_issuer_raw: bytes | None, pkg: EvidencePackage) -> None:
    """Re-verify an exported package: the chain links, every signature, the
    recorded head, and the totals. Raises ValueError on the first failure.

    ``trusted_issuer_raw`` pins the key; None checks integrity only. The totals
    are recomputed because a package is a document that travels — the numbers
    an assessor reads must be the ones the receipts actually support.
    """
    if pkg.v != _EVIDENCE_CHAIN_VERSION:
        raise ValueError(f"rateguard: unsupported evidence package version {pkg.v!r}")
    if pkg.entry_count != len(pkg.entries):
        raise ValueError(
            f"rateguard: evidence package claims {pkg.entry_count} entries, carries {len(pkg.entries)}"
        )
    verify_evidence_chain(trusted_issuer_raw, pkg.entries, pkg.chain_head)

    total_tokens = sum(e.receipt.claims.total_tokens for e in pkg.entries)
    total_cost = sum(e.receipt.claims.estimated_cost_micro_usd for e in pkg.entries)
    if total_tokens != pkg.total_tokens:
        raise ValueError(
            f"rateguard: evidence package claims {pkg.total_tokens} total tokens, "
            f"receipts sum to {total_tokens}"
        )
    if total_cost != pkg.total_estimated_cost_micro_usd:
        raise ValueError(
            f"rateguard: evidence package claims {pkg.total_estimated_cost_micro_usd} micro-USD, "
            f"receipts sum to {total_cost}"
        )
