from __future__ import annotations

import json
import logging
from typing import Iterable, TypeGuard

from ..types import HeadersLike, JsonObject, JsonValue, TokenUsage

logger = logging.getLogger(__name__)


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


def read_first_int_header(headers: HeadersLike | None, names: list[str]) -> int:
    for name in names:
        value = read_header(headers, name)
        if not value:
            continue
        try:
            return int(value)
        except ValueError as exc:
            logger.warning("RateGuard ignored invalid integer token header %s=%r: %s", name, value, exc)
            continue
    return 0


def extract_token_usage_from_headers(headers: HeadersLike | None) -> TokenUsage | None:
    input_tokens = read_first_int_header(
        headers,
        ["x-rateguard-input-tokens", "x-input-tokens", "input-tokens", "prompt-tokens"],
    )
    output_tokens = read_first_int_header(
        headers,
        ["x-rateguard-output-tokens", "x-output-tokens", "output-tokens", "completion-tokens"],
    )
    total_tokens = read_first_int_header(
        headers,
        ["x-rateguard-total-tokens", "x-total-tokens", "total-tokens"],
    )
    if input_tokens == 0 and output_tokens == 0 and total_tokens == 0:
        return None
    return TokenUsage(
        provider=read_first_header(headers, ["x-rateguard-provider", "x-provider", "provider"]) or None,
        model=read_first_header(headers, ["x-rateguard-model", "x-model", "model"]) or None,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens or input_tokens + output_tokens,
    )


def safe_json_parse(text: str) -> JsonValue | None:
    if not looks_like_json(text):
        return None
    try:
        parsed: object = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning("RateGuard failed to parse token usage JSON payload: %s", exc)
        return None
    return parsed if is_json_value(parsed) else None


def is_json_value(value: object) -> TypeGuard[JsonValue]:
    if value is None or isinstance(value, (str, int, float, bool)):
        return True
    if isinstance(value, list):
        return all(is_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and is_json_value(item) for key, item in value.items())
    return False


def _has_sse_data_line(text: str) -> bool:
    """True when any line begins an SSE data event."""
    return any(line.strip().startswith("data:") for line in text.splitlines())


def extract_token_usage_from_text(text: str) -> TokenUsage | None:
    from ..extractors.generic import extract_token_usage_from_value

    stripped = text.strip()
    if not stripped:
        return None
    # SSE is decided by a line ACTUALLY starting with "data:", not by the text
    # containing a newline. Requiring a newline broke the single-usage-event
    # case — which is the OpenAI-compatible shape, where only the final chunk
    # carries usage. That text is one "data: {...}" line with no newline, so
    # it fell through and got JSON-parsed WITH the "data: " prefix still on
    # it, failing silently and reporting no usage at all. Substring-matching
    # "data:" alone is not enough either: a plain JSON body like
    # {"data":[...]} contains it.
    if _has_sse_data_line(stripped):
        aggregate: TokenUsage | None = None
        for line in stripped.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload:
                continue
            if payload == "[DONE]":
                continue
            usage = extract_token_usage_from_value(safe_json_parse(payload))
            if usage is None:
                continue
            aggregate = usage if aggregate is None else merge_usage(aggregate, usage)
        return aggregate
    return extract_token_usage_from_value(safe_json_parse(stripped))


def merge_usage(base: TokenUsage, addition: TokenUsage) -> TokenUsage:
    # Max semantics, matching Go/Node: streaming providers repeat and refine
    # usage across events; summing would double-count.
    from ..extractors.generic import merge_usage_max

    return merge_usage_max(base, addition)


def looks_like_json(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("{") or stripped.startswith("[")


def format_retry_after_ms(retry_after_ms: int) -> str:
    return str(max(1, (retry_after_ms + 999) // 1000))
