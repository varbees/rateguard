from __future__ import annotations

from .generic import extract_token_usage_from_value


def extract_anthropic_usage(value: object | None):
    return extract_token_usage_from_value(value)

