from __future__ import annotations

import json
from typing import Iterable

from ..types import HeadersLike, TokenUsage


def lower_bound(values: list[float], target: float) -> int:
    low = 0
    high = len(values)
    while low < high:
        mid = (low + high) // 2
        value = values[mid] if mid < len(values) else float("inf")
        if value < target:
            low = mid + 1
        else:
            high = mid
    return low


def read_header(headers: HeadersLike | None, name: str) -> str:
    if headers is None:
        return ""
    lower = name.lower()
    getter = getattr(headers, "get", None)
    if callable(getter):
        value = getter(name)
        if isinstance(value, str):
            return value.strip()
    for key, value in headers.items():
        if key.lower() != lower:
            continue
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, Iterable):
            first = next(iter(value), "")
            return str(first).strip()
    return ""


def read_first_header(headers: HeadersLike | None, names: list[str]) -> str:
    for name in names:
        value = read_header(headers, name)
        if value:
            return value
    return ""


def safe_json_parse(text: str) -> object | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def extract_token_usage_from_text(text: str) -> TokenUsage | None:
    from ..extractors.generic import extract_token_usage_from_value

    stripped = text.strip()
    if not stripped:
        return None
    if "data:" in text and "\n" in text:
        aggregate: TokenUsage | None = None
        for line in stripped.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload:
                continue
            usage = extract_token_usage_from_value(safe_json_parse(payload))
            if usage is None:
                continue
            aggregate = usage if aggregate is None else merge_usage(aggregate, usage)
        return aggregate
    return extract_token_usage_from_value(safe_json_parse(stripped))


def merge_usage(base: TokenUsage, addition: TokenUsage) -> TokenUsage:
    return TokenUsage(
        provider=base.provider or addition.provider,
        model=base.model or addition.model,
        input_tokens=base.input_tokens + addition.input_tokens,
        output_tokens=base.output_tokens + addition.output_tokens,
        total_tokens=base.total_tokens + addition.total_tokens,
    )


def format_retry_after_ms(retry_after_ms: int) -> str:
    return str(max(1, (retry_after_ms + 999) // 1000))
