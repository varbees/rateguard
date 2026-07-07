"""
Budget attestation tests — mirror of packages/sdk-go/budget_attestation_test.go.

Scenario-for-scenario port so both SDKs prove the same attenuation
invariants: root mint + verify, wrong root rejected, single-hop narrowing,
widening (tokens/providers/expiry/depth) rejected, wrong parent key
rejected, expiry, proof-of-possession (correct holder, impostor, replay
under a different context), and marshal round-trips that preserve
verification — including the None-vs-empty-list normalization case.

Expiry-through-real-clock note: verify_presentation (and verify_chain
without an explicit `now`) checks expiry against the real wall clock, so
those tests anchor their grants to datetime.now(timezone.utc). Only tests
driving the injected `now=` path use a fixed historical date. (Go's test
file had a time-bomb from a hardcoded date on the real-clock path,
fixed July 2026 — don't reintroduce it.)
"""

from __future__ import annotations

import dataclasses
from datetime import datetime, timedelta, timezone

import pytest

pytest.importorskip("cryptography")

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from rateguard import (
    BudgetGrant,
    BudgetToken,
    attest,
    new_root_budget_token,
    parse_budget_token,
    sign,
    signing_payload,
    verify_chain,
    verify_presentation,
)

FIXED_NOW = datetime(2026, 7, 5, 12, 0, 0, tzinfo=timezone.utc)


def _root_grant(now: datetime) -> BudgetGrant:
    return BudgetGrant(
        max_tokens=1_000_000,
        providers=["openai", "anthropic"],
        models=["gpt-4o", "claude-opus-4-5"],
        max_depth=3,
        expires_at=now + timedelta(hours=1),
    )


def test_new_root_budget_token_and_verify_chain() -> None:
    authority = Ed25519PrivateKey.generate()

    token, delegate_priv = new_root_budget_token(authority, _root_grant(FIXED_NOW))

    assert delegate_priv is not None, "expected a generated delegate private key"
    assert len(token.blocks) == 1
    grant = verify_chain(token, authority.public_key(), now=FIXED_NOW)
    assert grant.max_tokens == 1_000_000


def test_verify_chain_rejects_wrong_root_key() -> None:
    authority = Ed25519PrivateKey.generate()
    wrong = Ed25519PrivateKey.generate()

    token, _ = new_root_budget_token(authority, _root_grant(FIXED_NOW))

    with pytest.raises(ValueError, match="invalid signature"):
        verify_chain(token, wrong.public_key(), now=FIXED_NOW)


def test_attest_single_hop_delegation_narrows() -> None:
    authority = Ed25519PrivateKey.generate()
    root, root_priv = new_root_budget_token(authority, _root_grant(FIXED_NOW))
    assert root_priv is not None

    delegated, delegate_priv = attest(
        root,
        root_priv,
        BudgetGrant(
            max_tokens=10_000,  # narrower
            providers=["openai"],
            models=["gpt-4o"],
            max_depth=1,  # narrower (<= 3-1)
            expires_at=FIXED_NOW + timedelta(minutes=30),
        ),
    )

    assert delegate_priv is not None, "expected a generated delegate key for the sub-agent"
    assert len(delegated.blocks) == 2
    assert len(root.blocks) == 1, "attest must not mutate the input token"

    grant = verify_chain(delegated, authority.public_key(), now=FIXED_NOW)
    assert grant.max_tokens == 10_000, "effective grant should be the narrowed leaf"


def test_attest_rejects_widening_tokens() -> None:
    authority = Ed25519PrivateKey.generate()
    root, root_priv = new_root_budget_token(authority, _root_grant(FIXED_NOW))
    assert root_priv is not None

    with pytest.raises(ValueError, match="does not narrow"):
        attest(
            root,
            root_priv,
            BudgetGrant(
                max_tokens=2_000_000,  # wider than parent's 1,000,000
                max_depth=1,
                expires_at=FIXED_NOW + timedelta(minutes=30),
            ),
        )


def test_attest_rejects_widening_providers() -> None:
    authority = Ed25519PrivateKey.generate()
    root, root_priv = new_root_budget_token(authority, _root_grant(FIXED_NOW))
    assert root_priv is not None

    with pytest.raises(ValueError, match="does not narrow"):
        attest(
            root,
            root_priv,
            BudgetGrant(
                max_tokens=100,
                providers=["openai", "google"],  # "google" not in parent's list
                max_depth=1,
                expires_at=FIXED_NOW + timedelta(minutes=30),
            ),
        )


def test_attest_rejects_empty_child_list_against_restricted_parent() -> None:
    # An EMPTY child list against a restricted parent is a widening — "any
    # provider" is looser than a specific list.
    authority = Ed25519PrivateKey.generate()
    root, root_priv = new_root_budget_token(authority, _root_grant(FIXED_NOW))
    assert root_priv is not None

    with pytest.raises(ValueError, match="does not narrow"):
        attest(
            root,
            root_priv,
            BudgetGrant(
                max_tokens=100,
                providers=[],  # parent restricted to [openai, anthropic]
                models=["gpt-4o"],
                max_depth=1,
                expires_at=FIXED_NOW + timedelta(minutes=30),
            ),
        )


def test_attest_rejects_later_expiry() -> None:
    authority = Ed25519PrivateKey.generate()
    root, root_priv = new_root_budget_token(authority, _root_grant(FIXED_NOW))
    assert root_priv is not None

    with pytest.raises(ValueError, match="does not narrow"):
        attest(
            root,
            root_priv,
            BudgetGrant(
                max_tokens=100,
                providers=["openai"],
                models=["gpt-4o"],
                max_depth=1,
                expires_at=FIXED_NOW + timedelta(hours=2),  # later than parent's 1 hour
            ),
        )


def test_attest_rejects_depth_exhaustion() -> None:
    authority = Ed25519PrivateKey.generate()
    root, root_priv = new_root_budget_token(
        authority,
        BudgetGrant(max_tokens=1_000, max_depth=0, expires_at=FIXED_NOW + timedelta(hours=1)),
    )
    assert root_priv is not None

    with pytest.raises(ValueError, match="does not narrow"):
        attest(
            root,
            root_priv,
            BudgetGrant(max_tokens=100, max_depth=0, expires_at=FIXED_NOW + timedelta(minutes=30)),
        )


def test_attest_rejects_wrong_parent_key() -> None:
    authority = Ed25519PrivateKey.generate()
    wrong = Ed25519PrivateKey.generate()
    root, _ = new_root_budget_token(authority, _root_grant(FIXED_NOW))

    with pytest.raises(ValueError, match="does not match the token's current holder"):
        attest(
            root,
            wrong,
            BudgetGrant(
                max_tokens=100,
                providers=["openai"],
                models=["gpt-4o"],
                max_depth=1,
                expires_at=FIXED_NOW + timedelta(minutes=30),
            ),
        )


def test_verify_chain_rejects_expired_token() -> None:
    authority = Ed25519PrivateKey.generate()
    token, _ = new_root_budget_token(authority, _root_grant(FIXED_NOW))

    with pytest.raises(ValueError, match="expired"):
        verify_chain(token, authority.public_key(), now=FIXED_NOW + timedelta(hours=2))


def test_verify_chain_enforces_the_same_truncated_expiry_it_signed() -> None:
    # Reproduces a real gap: the signature commits to expires_at truncated
    # to whole seconds (see _format_expiry/signing_payload), but the expiry
    # CHECK used to compare against the raw, untruncated microsecond value.
    # A grant expiring at T+999999us was signed as if it expired at T, but
    # verify_chain would still accept it up to ~1s past T — the enforced
    # statement was looser than the signed one.
    authority = Ed25519PrivateKey.generate()
    base = FIXED_NOW
    grant = dataclasses.replace(_root_grant(base), expires_at=base + timedelta(microseconds=999_999))
    token, _ = new_root_budget_token(authority, grant)

    # 500ms past `base`: before the RAW expiry (base+999999us), so the old
    # buggy check would have accepted this — but it's already after the
    # TRUNCATED expiry the signature actually committed to.
    with pytest.raises(ValueError, match="expired"):
        verify_chain(token, authority.public_key(), now=base + timedelta(milliseconds=500))

    # At exactly `base` (the truncated/signed instant itself), it must
    # still verify — not yet expired.
    verify_chain(token, authority.public_key(), now=base)


def test_sign_and_verify_presentation() -> None:
    authority = Ed25519PrivateKey.generate()
    # verify_presentation checks expiry against the REAL clock — anchor the
    # grant to now(), never a fixed historical date.
    now = datetime.now(timezone.utc)
    token, delegate_priv = new_root_budget_token(authority, _root_grant(now))
    assert delegate_priv is not None

    context = b"request-nonce-abc123"
    signature = sign(token, delegate_priv, context)

    grant = verify_presentation(token, authority.public_key(), context, signature)
    assert grant.max_tokens == 1_000_000


def test_sign_rejects_wrong_holder() -> None:
    authority = Ed25519PrivateKey.generate()
    impostor = Ed25519PrivateKey.generate()
    token, _ = new_root_budget_token(authority, _root_grant(FIXED_NOW))

    # The impostor doesn't hold the token's delegate key, so sign itself
    # must refuse — this is the defensive check inside sign.
    with pytest.raises(ValueError, match="does not match the token's current holder"):
        sign(token, impostor, b"request-nonce")


def test_verify_presentation_rejects_replay_under_different_context() -> None:
    authority = Ed25519PrivateKey.generate()
    now = datetime.now(timezone.utc)  # real-clock path, same as above
    token, delegate_priv = new_root_budget_token(authority, _root_grant(now))
    assert delegate_priv is not None

    signature = sign(token, delegate_priv, b"original-context")

    with pytest.raises(ValueError, match="proof-of-possession"):
        verify_presentation(token, authority.public_key(), b"different-context", signature)


def test_explicit_delegate_public_key_returns_no_private_key() -> None:
    authority = Ed25519PrivateKey.generate()
    explicit_delegate = Ed25519PrivateKey.generate()

    token, generated = new_root_budget_token(
        authority, _root_grant(FIXED_NOW), delegate_public_key=explicit_delegate.public_key()
    )

    assert generated is None, "no private key should be generated when one was supplied"
    # The explicit delegate's own private key must work for signing.
    assert sign(token, explicit_delegate, b"ctx")


def test_marshal_round_trip_preserves_verification_with_none_lists() -> None:
    # Unrestricted root (default/empty providers+models) so the child can
    # validly leave them empty too — exercises None-vs-empty-list signing
    # determinism: normalized when signed, round-tripped through JSON as
    # [], and verification must recompute an identical signing payload
    # from the reconstructed grant.
    authority = Ed25519PrivateKey.generate()
    token, delegate_priv = new_root_budget_token(
        authority,
        BudgetGrant(max_tokens=1_000_000, max_depth=3, expires_at=FIXED_NOW + timedelta(hours=1)),
    )
    assert delegate_priv is not None

    delegated, _ = attest(
        token,
        delegate_priv,
        BudgetGrant(max_tokens=500, max_depth=0, expires_at=FIXED_NOW + timedelta(minutes=10)),
    )

    parsed = parse_budget_token(delegated.marshal())
    grant = verify_chain(parsed, authority.public_key(), now=FIXED_NOW)
    assert grant.max_tokens == 500


def test_marshal_round_trip_with_restricted_providers() -> None:
    authority = Ed25519PrivateKey.generate()
    token, delegate_priv = new_root_budget_token(authority, _root_grant(FIXED_NOW))
    assert delegate_priv is not None

    delegated, _ = attest(
        token,
        delegate_priv,
        BudgetGrant(
            max_tokens=500,
            providers=["openai"],  # narrowed subset of the root's list
            models=["gpt-4o"],
            max_depth=0,
            expires_at=FIXED_NOW + timedelta(minutes=10),
        ),
    )

    parsed = parse_budget_token(delegated.marshal())
    grant = verify_chain(parsed, authority.public_key(), now=FIXED_NOW)
    assert grant.providers == ["openai"]
    assert grant.models == ["gpt-4o"]


def test_naive_datetime_normalizes_identically_across_round_trip() -> None:
    # A naive expires_at is treated as UTC; the wire form re-parses as
    # tz-aware — the signing payload must come out identical either way or
    # round-tripped tokens would fail verification.
    naive = datetime(2030, 1, 1, 12, 0, 0)
    aware = datetime(2030, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    delegate = Ed25519PrivateKey.generate().public_key()
    grant_naive = BudgetGrant(max_tokens=10, max_depth=0, expires_at=naive)
    grant_aware = BudgetGrant(max_tokens=10, max_depth=0, expires_at=aware)
    assert signing_payload(grant_naive, delegate) == signing_payload(grant_aware, delegate)

    authority = Ed25519PrivateKey.generate()
    token, _ = new_root_budget_token(authority, grant_naive)
    parsed = parse_budget_token(token.marshal())
    grant = verify_chain(parsed, authority.public_key(), now=FIXED_NOW)
    assert grant.max_tokens == 10


def test_validate_rejects_missing_expiry() -> None:
    authority = Ed25519PrivateKey.generate()
    with pytest.raises(ValueError, match="expires_at"):
        new_root_budget_token(authority, BudgetGrant(max_tokens=100))


def test_validate_rejects_negative_depth() -> None:
    authority = Ed25519PrivateKey.generate()
    with pytest.raises(ValueError, match="max_depth"):
        new_root_budget_token(
            authority,
            BudgetGrant(max_tokens=100, max_depth=-1, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)),
        )


def test_verify_chain_rejects_empty_token() -> None:
    authority = Ed25519PrivateKey.generate()
    with pytest.raises(ValueError, match="empty budget token"):
        verify_chain(BudgetToken(), authority.public_key(), now=FIXED_NOW)


def test_tampered_grant_breaks_the_signature() -> None:
    # Widening a grant after signing must invalidate the chain — the
    # signature commits to the grant's exact terms.
    authority = Ed25519PrivateKey.generate()
    token, _ = new_root_budget_token(authority, _root_grant(FIXED_NOW))

    token.blocks[0].grant.max_tokens = 999_999_999

    with pytest.raises(ValueError, match="invalid signature"):
        verify_chain(token, authority.public_key(), now=FIXED_NOW)
