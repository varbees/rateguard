"""
Budget attestation — Ed25519 delegation chains.

Port of packages/sdk-go/budget_attestation.go (same algorithm, same trust
model, same wire shape).

Multi-agent systems delegate: an orchestrator hands a sub-task to a
tool-calling agent, which may hand a further sub-task to another agent,
possibly across process or trust boundaries. Today that delegation carries
no enforceable budget — the sub-agent either trusts the orchestrator's
word about its spending limit, or the orchestrator has to stay in the loop
for every call. Budget attestation closes that gap with a cryptographic
token, in the shape the IETF Agent Identity Protocol draft
(draft-prakash-aip, draft-singla-agent-identity-protocol) is standardizing
around: a chain of Ed25519-signed blocks where each hop can only NARROW
the grant it received — less budget, fewer providers, less delegation
depth, an earlier expiry — never widen it.

This is RateGuard's own extension, not a claim of AIP compliance — the
IETF spec is still draft-level. v0.1 scope: single-hop delegation,
verified end-to-end, is the primary target; the chain design supports
multiple hops because attenuation only works if it composes, but longer
chains are unproven in production here and should be adopted cautiously.

Trust model: verifiers must already know the ROOT authority's Ed25519
public key out-of-band (the same way a TLS client trusts a CA root
certificate) — RateGuard does not provide key distribution or a registry.
Everything after the root is self-contained: each block carries the next
hop's public key, so verification never needs to phone home.

A token is data — anyone who intercepts a serialized token can read its
terms, but using it to authorize a call requires signing a
verifier-supplied context with the current holder's PRIVATE key (see
sign/verify_presentation). Chain-only verification (verify_chain) proves
the terms are well-formed and unexpired; it does not prove the presenter
is the legitimate holder.

Dependency note: Python's stdlib has no Ed25519, so this module uses the
`cryptography` package — install the SDK's `attestation` extra
(``pip install varbees-rateguard[attestation]``). The import is LAZY
(inside the functions that actually sign/verify/generate keys), so simply
importing rateguard — or even this module — stays zero-dependency; only
calling attestation functions without `cryptography` installed raises
ImportError. Public keys are accepted either as the raw 32 bytes or as
``cryptography`` Ed25519PublicKey objects; private keys are always
``cryptography`` Ed25519PrivateKey objects.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from types import ModuleType
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )

    PublicKeyLike = Ed25519PublicKey | bytes
else:  # pragma: no cover - typing alias only
    PublicKeyLike = Any


def _ed25519() -> ModuleType:  # lazy: keeps `import rateguard` zero-dependency
    from cryptography.hazmat.primitives.asymmetric import ed25519

    return ed25519


def _public_bytes(key: "PublicKeyLike") -> bytes:
    """Normalize a public key (raw 32 bytes or Ed25519PublicKey) to raw bytes."""
    if isinstance(key, (bytes, bytearray)):
        return bytes(key)
    return key.public_bytes_raw()


def _private_public_bytes(private_key: "Ed25519PrivateKey") -> bytes:
    return private_key.public_key().public_bytes_raw()


def private_key_from_raw(raw: bytes) -> "Ed25519PrivateKey":
    """Reconstructs an Ed25519 private key from raw bytes. Accepts either a
    bare 32-byte seed or Go's 64-byte ed25519.PrivateKey convention (seed +
    public key concatenated) — only the seed (first 32 bytes) is used.
    Exported for MCP tool handlers, which receive keys as base64 strings
    over the wire, not key objects."""
    if len(raw) not in (32, 64):
        raise ValueError("rateguard: budget attestation requires a 32-byte seed or 64-byte Ed25519 private key")
    ed25519 = _ed25519()
    return cast("Ed25519PrivateKey", ed25519.Ed25519PrivateKey.from_private_bytes(raw[:32]))


def private_key_to_raw(key: "Ed25519PrivateKey") -> bytes:
    """Encodes an Ed25519 private key as Go's 64-byte ed25519.PrivateKey
    convention (seed + public key concatenated) — the interoperable wire
    format, so a key minted by one language's MCP tool works when handed
    to another's."""
    return key.private_bytes_raw() + _private_public_bytes(key)


def _verify_signature(public_raw: bytes, payload: bytes, signature: bytes) -> bool:
    ed25519 = _ed25519()
    from cryptography.exceptions import InvalidSignature

    try:
        public = ed25519.Ed25519PublicKey.from_public_bytes(public_raw)
        public.verify(signature, payload)
        return True
    except (InvalidSignature, ValueError):
        return False


def _normalize_expiry(expires_at: datetime) -> datetime:
    """Normalize a timestamp to timezone-aware UTC. Naive datetimes are
    treated as UTC (mirrors Go's .UTC() normalization in signingPayload —
    the same logical grant must sign and re-verify identically regardless
    of how its timestamp was constructed or how it round-tripped through
    marshal/parse_budget_token)."""
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=timezone.utc)
    return expires_at.astimezone(timezone.utc)


def _format_expiry(expires_at: datetime) -> str:
    """Single canonical ISO8601-UTC rendering used by BOTH the signing
    payload and the wire encoding, so a parsed token recomputes the exact
    payload bytes its signature committed to. Truncated to whole seconds
    (microsecond=0 drops the fractional component from isoformat() entirely)
    so Go, Node, and Python compute byte-identical payloads for the same
    instant: Go's time.Time JSON marshaling trims trailing zero fractional
    digits (0.5s -> ".5"), Python's isoformat would otherwise emit fixed
    6-digit microseconds, and Node's toISOString emits fixed 3-digit
    milliseconds — three different byte strings for the same moment, which
    would break cross-language Ed25519 verification."""
    normalized = _normalize_expiry(expires_at).replace(microsecond=0)
    return normalized.isoformat().replace("+00:00", "Z")


def _parse_expiry(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _normalize_strings(values: list[str] | None) -> list[str]:
    return [] if values is None else list(values)


def _is_subset_of(child: list[str] | None, parent: list[str]) -> bool:
    """Whether every entry in child appears in parent. An empty child
    against a restricted (non-empty) parent is a WIDENING — "any provider"
    is looser than a specific list — so it is rejected. Mirrors Go's
    isSubsetOf."""
    child = _normalize_strings(child)
    if not child:
        return False
    allowed = set(parent)
    return all(entry in allowed for entry in child)


@dataclass(slots=True)
class BudgetGrant:
    """The resource constraint one link of a budget token carries."""

    # Token budget available under this grant. <= 0 means unlimited — but a
    # child grant may only be unlimited if its parent is also unlimited;
    # once a chain sets a limit, no descendant can remove it.
    max_tokens: int = 0
    # Restricts which LLM providers this grant covers. Empty/None means any
    # provider. A child may narrow an unrestricted parent to a specific
    # list, but may never widen a restricted parent's list.
    providers: list[str] = field(default_factory=list)
    # Restricts which models this grant covers, same rules as providers.
    models: list[str] = field(default_factory=list)
    # How many further delegations are allowed starting from this block
    # (each delegation consumes exactly one unit). 0 means this holder may
    # use the grant but may not delegate it further.
    max_depth: int = 0
    # Mandatory — an unexpiring budget token is a standing liability. A
    # child's expiry must be at or before its parent's.
    expires_at: datetime | None = None

    def validate(self) -> None:
        if self.max_depth < 0:
            raise ValueError("rateguard: budget grant max_depth must be >= 0")
        if self.expires_at is None:
            raise ValueError("rateguard: budget grant expires_at must be set")

    def narrows(self, parent: "BudgetGrant") -> bool:
        """Whether this grant is a valid attenuation of parent: every field
        equal to or more restrictive, never looser."""
        if parent.max_tokens > 0:
            if self.max_tokens <= 0 or self.max_tokens > parent.max_tokens:
                return False
        if _normalize_strings(parent.providers) and not _is_subset_of(self.providers, parent.providers):
            return False
        if _normalize_strings(parent.models) and not _is_subset_of(self.models, parent.models):
            return False
        if self.max_depth > parent.max_depth - 1:
            return False
        if self.expires_at is None or parent.expires_at is None:
            return False
        if _normalize_expiry(self.expires_at) > _normalize_expiry(parent.expires_at):
            return False
        return True


@dataclass(slots=True)
class BudgetBlock:
    """One link of a BudgetToken's chain."""

    grant: BudgetGrant
    delegate_public_key: bytes  # raw 32-byte Ed25519 key; holder of this block onward
    # Over signing_payload(grant, delegate_public_key), made by the previous
    # holder's private key (or the root authority key for block 0).
    signature: bytes


@dataclass(slots=True)
class BudgetToken:
    """A chain of budget delegations, each narrower than the last."""

    blocks: list[BudgetBlock] = field(default_factory=list)

    def marshal(self) -> str:
        """Encode the token as compact JSON text — string-safe for MCP tool
        args, HTTP headers, and inter-process handoffs. Round-trips through
        the same canonical field set signing_payload uses, so a verified
        token stays verifiable after transport."""
        wire = [
            {
                "grant": {
                    "max_tokens": block.grant.max_tokens,
                    "providers": _normalize_strings(block.grant.providers),
                    "models": _normalize_strings(block.grant.models),
                    "max_depth": block.grant.max_depth,
                    "expires_at": _format_expiry(_require_expiry(block.grant)),
                },
                "delegate_public_key": base64.b64encode(block.delegate_public_key).decode("ascii"),
                "signature": base64.b64encode(block.signature).decode("ascii"),
            }
            for block in self.blocks
        ]
        return json.dumps(wire, separators=(",", ":"))


def _require_expiry(grant: BudgetGrant) -> datetime:
    if grant.expires_at is None:
        raise ValueError("rateguard: budget grant expires_at must be set")
    return grant.expires_at


def signing_payload(grant: BudgetGrant, delegate_public_key: "PublicKeyLike") -> bytes:
    """The canonical, deterministic byte encoding a block's signature
    commits to. Lists are normalized (None == empty) and the expiry is
    normalized to a whole-second ISO8601 UTC instant (see _format_expiry)
    so the same logical grant always signs and verifies identically
    regardless of how it was constructed or how it round-tripped through
    marshal/parse_budget_token — including across Go, Node, and Python."""
    payload = {
        "max_tokens": grant.max_tokens,
        "providers": _normalize_strings(grant.providers),
        "models": _normalize_strings(grant.models),
        "max_depth": grant.max_depth,
        "expires_at": _format_expiry(_require_expiry(grant)),
        "delegate_public_key": base64.b64encode(_public_bytes(delegate_public_key)).decode("ascii"),
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def _resolve_delegate_key(existing: "PublicKeyLike | None") -> tuple[bytes, "Ed25519PrivateKey | None"]:
    if existing is not None:
        return _public_bytes(existing), None  # caller already holds the matching private key
    ed25519 = _ed25519()
    private = ed25519.Ed25519PrivateKey.generate()
    return _private_public_bytes(private), private


def new_root_budget_token(
    authority_private_key: "Ed25519PrivateKey",
    grant: BudgetGrant,
    delegate_public_key: "PublicKeyLike | None" = None,
) -> tuple[BudgetToken, "Ed25519PrivateKey | None"]:
    """Mint the genesis block of a budget token, signed by
    authority_private_key — the long-term key every verifier must already
    trust out-of-band as the root of authority.

    If delegate_public_key is given, the token is issued to that
    externally-generated key — the delegate generated its own keypair and
    shared only the public half, so its private key never transits through
    the delegator (the recommended pattern for multi-hop chains) — and the
    returned private key is None. If omitted, a fresh keypair is generated
    and its private key returned — the convenience path for a delegator
    bootstrapping a sub-agent it is about to spawn itself.
    """
    grant.validate()
    delegate_pub, delegate_priv = _resolve_delegate_key(delegate_public_key)
    signature = authority_private_key.sign(signing_payload(grant, delegate_pub))
    token = BudgetToken(blocks=[BudgetBlock(grant=grant, delegate_public_key=delegate_pub, signature=signature)])
    return token, delegate_priv


def attest(
    token: BudgetToken,
    parent_private_key: "Ed25519PrivateKey",
    grant: BudgetGrant,
    delegate_public_key: "PublicKeyLike | None" = None,
) -> tuple[BudgetToken, "Ed25519PrivateKey | None"]:
    """Extend token with a new, narrower delegation. parent_private_key
    must correspond to token's current last-block delegate public key —
    proof that the caller is the legitimate current holder, not just anyone
    who saw the token. Returns the extended token (the input token is not
    mutated) and, when delegate_public_key was omitted, the freshly
    generated next-holder private key."""
    if token is None or not token.blocks:
        raise ValueError("rateguard: cannot attest from an empty token")
    last = token.blocks[-1]
    if _private_public_bytes(parent_private_key) != last.delegate_public_key:
        raise ValueError("rateguard: parent private key does not match the token's current holder key")
    grant.validate()
    if not grant.narrows(last.grant):
        raise ValueError("rateguard: new grant does not narrow the parent grant")

    delegate_pub, delegate_priv = _resolve_delegate_key(delegate_public_key)
    signature = parent_private_key.sign(signing_payload(grant, delegate_pub))

    extended = list(token.blocks)
    extended.append(BudgetBlock(grant=grant, delegate_public_key=delegate_pub, signature=signature))
    return BudgetToken(blocks=extended), delegate_priv


def verify_chain(
    token: BudgetToken,
    root_public_key: "PublicKeyLike",
    *,
    now: datetime | None = None,
) -> BudgetGrant:
    """Validate a token's signature chain against root_public_key and check
    every block narrows its parent and none has expired. Returns the
    effective grant (the final, narrowest block) on success.

    This does NOT prove the presenter legitimately holds the token — a
    token is data, readable by anyone who intercepts it. Use
    verify_presentation for an authorization decision.

    `now` overrides the expiry-check clock (tests/simulation); it defaults
    to the real current UTC time, mirroring Go's VerifyChain/verifyChainAt
    split.
    """
    if token is None or not token.blocks:
        raise ValueError("rateguard: empty budget token")
    if now is None:
        now = datetime.now(timezone.utc)
    else:
        now = _normalize_expiry(now)

    root_raw = _public_bytes(root_public_key)
    effective = BudgetGrant()
    signer = root_raw
    for index, block in enumerate(token.blocks):
        if not _verify_signature(signer, signing_payload(block.grant, block.delegate_public_key), block.signature):
            raise ValueError(f"rateguard: budget token block {index}: invalid signature")
        if index > 0 and not block.grant.narrows(effective):
            raise ValueError(f"rateguard: budget token block {index}: grant does not narrow its parent")
        # Check against the SAME truncated-to-whole-seconds instant the
        # signature committed to (see _format_expiry/signing_payload), not
        # the raw expires_at — otherwise a holder could edit the token's
        # sub-second expiry digits (which the signature never covered) to
        # stretch validity by up to 1s beyond what was actually signed.
        expires_at = _normalize_expiry(_require_expiry(block.grant)).replace(microsecond=0)
        if now > expires_at:
            raise ValueError(f"rateguard: budget token block {index}: expired at {expires_at.isoformat()}")
        effective = block.grant
        signer = block.delegate_public_key
    return effective


def sign(token: BudgetToken, holder_private_key: "Ed25519PrivateKey", context: bytes) -> bytes:
    """Produce a proof-of-possession signature over context using
    holder_private_key. context is typically a verifier-supplied nonce or a
    digest of the request being authorized — signing it binds this specific
    use to this specific holder, so a captured token alone cannot be
    replayed against a different challenge."""
    if token is None or not token.blocks:
        raise ValueError("rateguard: cannot sign with an empty token")
    last = token.blocks[-1]
    if _private_public_bytes(holder_private_key) != last.delegate_public_key:
        raise ValueError("rateguard: private key does not match the token's current holder key")
    return holder_private_key.sign(context)


def verify_presentation(
    token: BudgetToken,
    root_public_key: "PublicKeyLike",
    context: bytes,
    signature: bytes,
) -> BudgetGrant:
    """Full authorization check: the chain must be valid (see verify_chain)
    AND signature must be a valid proof-of-possession over context, made by
    the token's current holder key. This is the check a receiving agent or
    MCP tool should run before honoring a budget token. Expiry is checked
    against the real current UTC time."""
    grant = verify_chain(token, root_public_key)
    last = token.blocks[-1]
    if not _verify_signature(last.delegate_public_key, context, signature):
        raise ValueError("rateguard: proof-of-possession signature invalid")
    return grant


def parse_budget_token(text: str) -> BudgetToken:
    """Decode a token previously produced by BudgetToken.marshal()."""
    try:
        wire = json.loads(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError(f"rateguard: parse budget token: {exc}") from exc
    if not isinstance(wire, list):
        raise ValueError("rateguard: parse budget token: expected a JSON array of blocks")

    blocks: list[BudgetBlock] = []
    for index, entry in enumerate(wire):
        try:
            raw_grant = entry["grant"]
            grant = BudgetGrant(
                max_tokens=int(raw_grant.get("max_tokens", 0)),
                providers=_normalize_strings(raw_grant.get("providers")),
                models=_normalize_strings(raw_grant.get("models")),
                max_depth=int(raw_grant.get("max_depth", 0)),
                expires_at=_parse_expiry(raw_grant["expires_at"]),
            )
            delegate_pub = base64.b64decode(entry["delegate_public_key"], validate=True)
            signature = base64.b64decode(entry["signature"], validate=True)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"rateguard: parse budget token block {index}: {exc}") from exc
        blocks.append(BudgetBlock(grant=grant, delegate_public_key=delegate_pub, signature=signature))
    return BudgetToken(blocks=blocks)
