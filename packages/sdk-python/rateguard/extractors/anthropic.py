from __future__ import annotations

from .generic import extract_token_usage_from_value
from ..types import JsonValue, TokenUsage


def extract_anthropic_usage(value: JsonValue | None) -> TokenUsage | None:
    return extract_token_usage_from_value(value)
