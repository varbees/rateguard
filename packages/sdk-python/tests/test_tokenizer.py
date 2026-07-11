"""CJK-aware token estimation: shared conformance oracle + the guardrail
fail-safe it fixes. Mirrors Go's tokenizer_test.go and Node's tokenizer.test.ts
— all three load conformance/token_estimate_vectors.json and must agree."""

from __future__ import annotations

import json
import pathlib

from rateguard import TokenLimitGuardrail, estimate_tokens
from rateguard.core.tokenizer import estimate_with

_VECTORS = pathlib.Path(__file__).resolve().parents[3] / "conformance" / "token_estimate_vectors.json"


def test_conformance_vectors() -> None:
    doc = json.loads(_VECTORS.read_text(encoding="utf-8"))
    for vec in doc["vectors"]:
        assert estimate_tokens(vec["text"]) == vec["expected_tokens"], vec["name"]


def test_cjk_is_not_undercounted() -> None:
    # The old len//4 heuristic read 4 Chinese chars as 1 token; the fix reads
    # them at ~1 token each. Guards against silent regression to chars/4.
    assert estimate_tokens("你好世界") == 4
    assert estimate_tokens("你好世界") != len("你好世界") // 4  # not the old len//4


def test_token_limit_guardrail_blocks_cjk_that_chars_over_4_would_miss() -> None:
    # 40 Chinese characters ~= 40 tokens. A limit of 20 must block it. Under
    # the old len(content)//4 (== 10), this prompt slipped through — the DoW hole.
    prompt = "字" * 40
    guard = TokenLimitGuardrail(max_tokens=20)
    violation = guard.check(prompt)
    assert violation is not None
    assert violation.code == "token_limit_exceeded"

    # Latin text is unaffected: 40 ASCII chars ~= 10 tokens, under the limit.
    assert guard.check("a" * 40) is None


def test_custom_tokenizer_overrides_default() -> None:
    class AlwaysHuge:
        def estimate_tokens(self, text: str) -> int:
            return 10_000

    guard = TokenLimitGuardrail(max_tokens=100, tokenizer=AlwaysHuge())
    assert guard.check("hi").code == "token_limit_exceeded"
    assert estimate_with(AlwaysHuge(), "hi") == 10_000
    assert estimate_with(None, "hi") == estimate_tokens("hi")
