"""Mirrors sdk-go/request_estimate_test.go and sdk-node/test/request-estimate.test.ts.

The reservation used to be a flat 4096 for every call. These pin the measured
replacement — especially that a long-context call now reserves what it will
actually burn, which is the denial-of-wallet hole the constant left open.
"""

from __future__ import annotations

import json

import pytest

from rateguard.core.request_estimate import (
    DEFAULT_OUTPUT_ALLOWANCE,
    MAX_ESTIMATE_BODY_BYTES,
    estimate_request_tokens,
)

OLD_CONSTANT = 4096


def _body(payload: object) -> bytes:
    return json.dumps(payload).encode()


def test_openai_chat_is_prompt_plus_declared_ceiling() -> None:
    body = _body({
        "model": "gpt-4o",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Explain quicksort."},
        ],
        "max_tokens": 500,
    })

    got = estimate_request_tokens(body)
    assert got > 500, "the prompt must ride on top of the declared ceiling"
    assert got < 600


def test_long_context_reserves_its_real_cost() -> None:
    """The regression that matters: the flat 4096 under-reserved this ~25x."""
    context = "the quick brown fox jumps over the lazy dog. " * 9000
    body = _body({
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": context}],
        "max_tokens": 1000,
    })

    got = estimate_request_tokens(body)
    assert got > OLD_CONSTANT
    assert 90_000 < got < 110_000, f"estimate {got} not close to the ~101K this really costs"


def test_anthropic_system_and_ceiling() -> None:
    body = _body({
        "model": "claude-sonnet-4",
        "system": "You are terse.",
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 2048,
    })
    assert estimate_request_tokens(body) > 2048


def test_gemini_shape() -> None:
    body = _body({
        "contents": [{"parts": [{"text": "Explain gravity briefly."}]}],
        "systemInstruction": {"parts": [{"text": "Be concise."}]},
        "generationConfig": {"maxOutputTokens": 256},
    })

    got = estimate_request_tokens(body)
    assert got > 256
    assert got < 300


def test_multimodal_counts_text_part() -> None:
    body = _body({
        "model": "gpt-4o",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": "What is in this image?"},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}},
            ],
        }],
        "max_tokens": 100,
    })
    # The text counts; the image does not (its cost is not derivable from the
    # request). A documented under-count, asserted so it stays known.
    assert estimate_request_tokens(body) > 100


def test_cjk_is_not_undercounted() -> None:
    # 2000 CJK chars ~= 2000 tokens, not 500. A chars/4 estimate would
    # under-reserve this 4x and let it overshoot by the same factor.
    body = _body({
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "字" * 2000}],
        "max_tokens": 100,
    })
    assert estimate_request_tokens(body) >= 2000


def test_prefers_max_completion_tokens() -> None:
    body = _body({
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 10,
        "max_completion_tokens": 4000,
    })
    assert estimate_request_tokens(body) >= 4000


def test_honors_custom_tokenizer() -> None:
    class Fixed:
        def estimate_tokens(self, text: str) -> int:
            return 777

    body = _body({"messages": [{"role": "user", "content": "hello"}], "max_tokens": 10})
    assert estimate_request_tokens(body, Fixed()) == 777 + 10


@pytest.mark.parametrize(
    "name,body",
    [
        ("empty", b""),
        ("none", None),
        (
            "oversized",
            b'{"messages":[{"role":"user","content":"' + b"x" * (MAX_ESTIMATE_BODY_BYTES + 1) + b'"}]}',
        ),
    ],
)
def test_reserve_all_only_when_unwalkable(name: str, body: bytes | None) -> None:
    """Reserve-all (0) is for bodies there is nothing to measure."""
    assert estimate_request_tokens(body) == 0, name


@pytest.mark.parametrize(
    "name,body",
    [
        ("not json", b"not json at all"),
        ("truncated json", b'{"messages": [{"role":'),
        ("unknown schema", b'{"some_other_api": {"field": "value"}}'),
        ("empty messages", b'{"model": "gpt-4o", "messages": []}'),
        ("stream flag only", b'{"model":"gpt-4o","stream":true}'),
    ],
)
def test_unknown_schema_is_bounded_by_size(name: str, body: bytes) -> None:
    """An unrecognized body still gets a real, bounded reservation.

    Reserve-all would serialize the budget key and turn one unrecognized shape
    into an application-wide throttle.
    """
    got = estimate_request_tokens(body)
    assert got > 0, f"{name}: reserve-all would serialize the whole budget key"
    assert got <= len(body) + DEFAULT_OUTPUT_ALLOWANCE, f"{name}: exceeds its own byte-count bound"


def test_unknown_schema_estimate_scales_with_body_size() -> None:
    """A bigger unknown body must reserve more. This is the property that matters.

    Caught by mutation testing (scripts/mutate.py). The bounds assertions above
    look thorough and are not: with the body's size ignored entirely — every
    unknown body reserving a flat DEFAULT_OUTPUT_ALLOWANCE — both still pass.
    4096 > 0 holds, and 4096 <= len(body) + 4096 holds for any body. So a
    30-byte payload and a 300KB payload were indistinguishable to the suite,
    which is exactly the under-reservation the size-bound exists to prevent.

    Bounds are not behaviour. The behaviour is: the estimate tracks the bytes.
    """
    small = b'{"unknown_api": "' + b"x" * 100 + b'"}'
    large = b'{"unknown_api": "' + b"x" * 100_000 + b'"}'

    small_estimate = estimate_request_tokens(small)
    large_estimate = estimate_request_tokens(large)

    assert large_estimate > small_estimate, (
        f"a 100KB unrecognized body reserved {large_estimate} and a 100-byte one "
        f"reserved {small_estimate} — the estimate is ignoring the body's size, so a "
        f"large prompt in a schema we do not parse slips through under-reserved"
    )
    # And it must actually track the bytes, not merely differ by one.
    assert large_estimate >= small_estimate + 20_000, (
        f"100KB of unknown body only moved the estimate from {small_estimate} to "
        f"{large_estimate} — far below the ~25K tokens those bytes could carry"
    )
