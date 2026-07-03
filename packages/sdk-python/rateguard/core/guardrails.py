"""
Content Guardrails — prompt-level safety checks.
Run BEFORE the LLM call. Pluggable interface.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol


@dataclass
class GuardrailViolation:
    code: str     # e.g. "pii_detected", "prompt_injection"
    message: str  # human-readable explanation
    score: float = 0.0  # 0.0–1.0 severity


class Guardrail(Protocol):
    """Check whether content passes safety checks. Return violation or None."""

    def check(self, content: str) -> GuardrailViolation | None: ...


class GuardrailChain:
    """Runs multiple guardrails in order. Stops at first violation."""

    def __init__(self, guardrails: list[Guardrail]) -> None:
        self.guardrails = guardrails

    def check(self, content: str) -> GuardrailViolation | None:
        for g in self.guardrails:
            v = g.check(content)
            if v:
                return v
        return None


# ── Built-in guardrails ──

_CC_RE = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
_PHONE_RE = re.compile(r"\b(?:\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b")
_SSN_RE = re.compile(r"\b\d{3}[-]?\d{2}[-]?\d{4}\b")


class PIIGuardrail:
    def check(self, content: str) -> GuardrailViolation | None:
        for p in (_CC_RE, _EMAIL_RE, _PHONE_RE, _SSN_RE):
            if p.search(content):
                return GuardrailViolation("pii_detected", "prompt contains PII", 0.9)
        return None


_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|prompts?|rules?)", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+(a\s+)?(DAN|jailbreak|unfiltered|evil|malicious)", re.IGNORECASE),
    re.compile(r"(print|show|reveal|display|output)\s+(your\s+)?(system\s+(prompt|message|instructions?)|initial\s+prompt)", re.IGNORECASE),
    re.compile(r"(from\s+now\s+on|starting\s+now|henceforth)\s+(you\s+(will|must|are))", re.IGNORECASE),
    re.compile(r"(decode|decrypt|translate)\s+(this|the\s+following)\s+(base64|hex|encoded|encrypted)", re.IGNORECASE),
]


class PromptInjectionGuardrail:
    def check(self, content: str) -> GuardrailViolation | None:
        for p in _INJECTION_PATTERNS:
            if p.search(content):
                return GuardrailViolation("prompt_injection", "potential prompt injection", 0.8)
        return None


class TokenLimitGuardrail:
    def __init__(self, max_tokens: int) -> None:
        self.max_tokens = max_tokens

    def check(self, content: str) -> GuardrailViolation | None:
        if len(content) // 4 > self.max_tokens:
            return GuardrailViolation("token_limit_exceeded", "prompt exceeds token limit", 1.0)
        return None


class MaxLengthGuardrail:
    def __init__(self, max_bytes: int) -> None:
        self.max_bytes = max_bytes

    def check(self, content: str) -> GuardrailViolation | None:
        if len(content) > self.max_bytes:
            return GuardrailViolation("content_too_long", "prompt exceeds byte limit", 1.0)
        return None


def standard_guardrails() -> GuardrailChain:
    return GuardrailChain([PIIGuardrail(), PromptInjectionGuardrail(), MaxLengthGuardrail(100_000)])


def strict_guardrails() -> GuardrailChain:
    return GuardrailChain([PIIGuardrail(), PromptInjectionGuardrail(), TokenLimitGuardrail(32_000), MaxLengthGuardrail(50_000)])
