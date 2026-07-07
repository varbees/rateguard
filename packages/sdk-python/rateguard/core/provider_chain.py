"""
Provider Chain — automatic LLM provider fallback.
Circuit breaker trips → auto-route to next provider in chain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .outbound import FallbackProvider


@dataclass
class ProviderEntry:
    name: str          # e.g. "openai", "anthropic"
    model: str         # e.g. "gpt-4o", "claude-sonnet-4"
    base_url: str      # e.g. "https://api.openai.com/v1"
    weight: int = 0    # lower = higher priority

    def __post_init__(self) -> None:
        if not self.weight:
            self.weight = len(self.name)


CircuitBreakerState = Literal["closed", "open", "half-open"]


class ProviderChain:
    """Ordered list of LLM providers with automatic fallback."""

    def __init__(self, providers: list[ProviderEntry]) -> None:
        self.providers = providers

    def route(
        self,
        failing_provider: str | None,
        breaker_state: CircuitBreakerState,
    ) -> ProviderEntry | None:
        """Returns the first available provider after the failing one."""
        if not self.providers:
            return None
        if not failing_provider or breaker_state == "closed":
            return self.providers[0]

        found = False
        for p in self.providers:
            if p.name == failing_provider:
                found = True
                continue
            if found:
                return p
        return self.providers[0]  # last resort


# ── Preset chains ──
#
# Return list[FallbackProvider] directly, NOT a ProviderChain instance —
# that class's .route() is never called anywhere in the real request path
# (the outbound transport indexes its chain option as a plain list; see
# core/outbound.py's _OutboundCore.chain / next_provider), so a
# ProviderChain wrapper here used to be a genuinely unusable public API:
# passing default_provider_chain() to wrap_httpx_client(chain=...) crashed
# at the moment a fallback was actually attempted with `TypeError: object
# of type 'ProviderChain' has no len()` — confirmed by actually forcing a
# 429-triggered fallback through a mocked transport, not by inspection
# alone. FallbackProvider (core/outbound.py) is the real, consumed type;
# ProviderEntry (this module) only ever fed the disconnected ProviderChain
# class.
#
# Every entry below must be a genuinely OpenAI-compatible endpoint — the
# outbound transport's fallback rewrites a failed request onto the next
# entry's base_url by appending "/chat/completions" and re-sending the SAME
# OpenAI-shaped JSON body. That only works when the target actually speaks
# that schema. Anthropic's native Messages API does not (different path —
# /v1/messages, not /chat/completions — different request/response shape
# entirely), so it's deliberately absent here despite being a top-tier
# model: an earlier version of these three chains included it, and a
# reproduction test (mirroring Go's) confirmed the resulting fallback
# request really does get sent to Anthropic's real API at the wrong path
# with the wrong body shape — not a hypothetical concern. Google is
# included via its own OpenAI-compatible endpoint specifically (base_url
# ends in /v1beta/openai, not bare /v1beta). If you need Anthropic in your
# own fallback logic, that has to happen at the application layer (catch
# the error, call Anthropic's own SDK yourself) — cross-schema fallback is
# impossible at the transport layer and is not claimed anywhere else in
# this package either.

def default_provider_chain() -> list[FallbackProvider]:
    return [
        FallbackProvider("openai", "https://api.openai.com/v1", "gpt-4o"),
        FallbackProvider("google", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
    ]


def budget_provider_chain() -> list[FallbackProvider]:
    return [
        FallbackProvider("google", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
        FallbackProvider("openai", "https://api.openai.com/v1", "gpt-4o-mini"),
        FallbackProvider("deepseek", "https://api.deepseek.com/v1", "deepseek-chat"),
    ]


def quality_provider_chain() -> list[FallbackProvider]:
    return [
        FallbackProvider("openai", "https://api.openai.com/v1", "gpt-4o"),
        FallbackProvider("google", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-pro"),
    ]
