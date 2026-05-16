from __future__ import annotations

from .generic import extract_token_usage_from_value
from ..types import JsonValue


def extract_openai_usage(value: JsonValue | None):
    return extract_token_usage_from_value(value)
