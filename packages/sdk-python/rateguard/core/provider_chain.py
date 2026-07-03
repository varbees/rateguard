"""
Provider Chain — automatic LLM provider fallback.
Circuit breaker trips → auto-route to next provider in chain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


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

def default_provider_chain() -> ProviderChain:
    return ProviderChain([
        ProviderEntry("openai", "gpt-4o", "https://api.openai.com/v1"),
        ProviderEntry("anthropic", "claude-sonnet-4", "https://api.anthropic.com/v1"),
        ProviderEntry("google", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta"),
    ])


def budget_provider_chain() -> ProviderChain:
    return ProviderChain([
        ProviderEntry("google", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta"),
        ProviderEntry("openai", "gpt-4o-mini", "https://api.openai.com/v1"),
        ProviderEntry("anthropic", "claude-haiku-3.5", "https://api.anthropic.com/v1"),
    ])


def quality_provider_chain() -> ProviderChain:
    return ProviderChain([
        ProviderEntry("anthropic", "claude-opus-4-5", "https://api.anthropic.com/v1"),
        ProviderEntry("openai", "gpt-4o", "https://api.openai.com/v1"),
        ProviderEntry("google", "gemini-2.5-pro", "https://generativelanguage.googleapis.com/v1beta"),
    ])
