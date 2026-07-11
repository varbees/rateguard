"""Dependency-free, CJK-aware token estimation.

RateGuard sizes two things in tokens without calling the provider: the
TokenLimitGuardrail (blocks a prompt over a limit) and the pre-flight budget
reservation. The naive ``len(text) // 4`` heuristic — one token per four
characters — holds for Latin scripts but undercounts Chinese, Japanese, and
Korean text by roughly 75%: those scripts tokenize at about one token per
*character*, not one per four. A 40k-token CJK prompt would read as ~10k and
slip past a limit sized in tokens — a real denial-of-wallet / limit-evasion
gap, and (because Go counted bytes while Node/Python counted code points) the
three SDKs disagreed on the same string.

``estimate_tokens`` is the shared fix: it counts CJK code points at ~1 token
each and everything else at ~4 characters per token. It operates on code
points (not bytes), so all three SDKs agree — locked by
``conformance/token_estimate_vectors.json``. It is an estimate, deliberately
biased not to UNDER-count so enforcement fails safe. When exact counts matter,
supply a ``Tokenizer`` (e.g. wrapping tiktoken) — the interface is the plug-in
point, kept out of the core so ``import rateguard`` stays zero-dependency.

Sources: OpenAI's published rule of thumb (~4 chars/token for English,
help.openai.com "What are tokens and how to count them"); the ~1 token/char
CJK ratio is the well-documented behavior of the cl100k_base / o200k_base BPE
vocabularies for unified ideographs and kana/hangul.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Tokenizer(Protocol):
    """Estimates the token count of a string. Implement to plug in an exact
    tokenizer where accuracy matters more than zero dependencies."""

    def estimate_tokens(self, text: str) -> int: ...


# CJK code-point blocks that tokenize at roughly one token per character.
# Kept identical across the Go/Node/Python SDKs; changing this set changes the
# conformance vectors. Each range is (low, high) inclusive.
_CJK_RANGES: tuple[tuple[int, int], ...] = (
    (0x3040, 0x309F),    # Hiragana
    (0x30A0, 0x30FF),    # Katakana
    (0x3400, 0x4DBF),    # CJK Unified Ideographs Extension A
    (0x4E00, 0x9FFF),    # CJK Unified Ideographs
    (0xAC00, 0xD7AF),    # Hangul Syllables
    (0xF900, 0xFAFF),    # CJK Compatibility Ideographs
    (0x20000, 0x2EBEF),  # CJK Unified Ideographs Extension B and beyond (astral)
)


def _is_cjk(code_point: int) -> bool:
    for low, high in _CJK_RANGES:
        if low <= code_point <= high:
            return True
    return False


def estimate_tokens(text: str) -> int:
    """RateGuard's default token estimate: ~1 token per CJK character, ~1 token
    per 4 characters otherwise, rounded up. Biased not to under-count so a
    token-sized limit fails safe on CJK input. See the module docstring."""
    cjk = 0
    other = 0
    for ch in text:
        if _is_cjk(ord(ch)):
            cjk += 1
        else:
            other += 1
    # ceil(other / 4) without floats: the non-CJK share, rounded up.
    return cjk + (other + 3) // 4


def estimate_with(tokenizer: Tokenizer | None, text: str) -> int:
    """Estimate via a caller-supplied Tokenizer, falling back to the default
    CJK-aware heuristic when none is set."""
    if tokenizer is not None:
        return tokenizer.estimate_tokens(text)
    return estimate_tokens(text)
