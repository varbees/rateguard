"""Mirrors sdk-go/adversarial_test.go and sdk-node/test/adversarial.test.ts.

A compromised or buggy provider is the adversary. The real denial-of-wallet
vector is not low usage (the provider bills what it reports) — it is a NEGATIVE
value: committing output_tokens=-1_000_000 would DECREASE recorded usage, an
attacker-controlled budget refund. All three SDKs had this hole; all three clamp.
"""

from __future__ import annotations

import pytest

from rateguard.core.utils import extract_token_usage_from_text


def _non_negative(usage: object) -> None:
    if usage is None:
        return
    assert getattr(usage, "input_tokens", 0) >= 0
    assert getattr(usage, "output_tokens", 0) >= 0
    assert getattr(usage, "total_tokens", 0) >= 0


def test_negative_usage_never_survives_extraction() -> None:
    # The dangerous one — a negative would refund the budget.
    usage = extract_token_usage_from_text(
        '{"usage":{"prompt_tokens":-1000000,"completion_tokens":-1000000,"total_tokens":-2000000}}'
    )
    _non_negative(usage)  # clamped to 0 -> no usage -> caller commits estimate


def test_mixed_negative_field_is_clamped() -> None:
    usage = extract_token_usage_from_text(
        '{"usage":{"prompt_tokens":100,"completion_tokens":-50,"total_tokens":50}}'
    )
    _non_negative(usage)


def test_bool_is_not_a_token_count() -> None:
    # bool is an int subclass in Python; True must not read as 1 token.
    usage = extract_token_usage_from_text('{"usage":{"prompt_tokens":true,"total_tokens":true}}')
    _non_negative(usage)


@pytest.mark.parametrize(
    "name,body",
    [
        ("string where int", '{"usage":{"prompt_tokens":"999","total_tokens":"1000"}}'),
        ("float tokens", '{"usage":{"prompt_tokens":1.5,"total_tokens":4}}'),
        ("null usage", '{"usage":null}'),
        ("usage not object", '{"usage":"lots"}'),
        ("nested garbage", '{"usage":{"prompt_tokens":{"evil":true}}}'),
        ("truncated sse", 'data: {"usage":{"prompt_tokens":10,"comple'),
        ("data no space", 'data:{"usage":{"total_tokens":5}}\n\n'),
        ("comments only", ": keepalive\n: keepalive\n\n"),
    ],
)
def test_hostile_inputs_do_not_crash_or_go_negative(name: str, body: str) -> None:
    _non_negative(extract_token_usage_from_text(body))
