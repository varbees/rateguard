from __future__ import annotations

from ..types import TokenUsage


def _as_dict(value: object) -> dict[str, object] | None:
    if isinstance(value, dict):
        return value
    return None


def _first_str(source: dict[str, object], keys: list[str]) -> str | None:
    for key in keys:
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _first_int(source: dict[str, object], keys: list[str]) -> int:
    for key in keys:
        value = source.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return 0


def extract_token_usage_from_value(value: object | None) -> TokenUsage | None:
    if value is None:
        return None
    if isinstance(value, list):
        aggregate: TokenUsage | None = None
        for item in value:
            usage = extract_token_usage_from_value(item)
            if usage is None:
                continue
            aggregate = usage if aggregate is None else TokenUsage(
                provider=aggregate.provider or usage.provider,
                model=aggregate.model or usage.model,
                input_tokens=aggregate.input_tokens + usage.input_tokens,
                output_tokens=aggregate.output_tokens + usage.output_tokens,
                total_tokens=aggregate.total_tokens + usage.total_tokens,
            )
        return aggregate
    record = _as_dict(value)
    if record is None:
        return None

    usage_source = _as_dict(record.get("usage")) or _as_dict(record.get("usageMetadata")) or record
    input_tokens = _first_int(usage_source, ["input_tokens", "prompt_tokens", "promptTokenCount"])
    output_tokens = _first_int(usage_source, ["output_tokens", "completion_tokens", "candidatesTokenCount"])
    total_tokens = _first_int(usage_source, ["total_tokens", "totalTokenCount"])

    provider = _first_str(record, ["provider", "x_provider", "token_provider"])
    model = _first_str(record, ["model", "x_model", "token_model"])

    if input_tokens == 0 and output_tokens == 0 and total_tokens == 0:
        nested = [
            extract_token_usage_from_value(item)
            for item in record.values()
        ]
        nested_usage = [usage for usage in nested if usage is not None]
        if not nested_usage:
            return None
        aggregate = nested_usage[0]
        for usage in nested_usage[1:]:
            aggregate = TokenUsage(
                provider=aggregate.provider or usage.provider,
                model=aggregate.model or usage.model,
                input_tokens=aggregate.input_tokens + usage.input_tokens,
                output_tokens=aggregate.output_tokens + usage.output_tokens,
                total_tokens=aggregate.total_tokens + usage.total_tokens,
            )
        return aggregate

    return TokenUsage(
        provider=provider,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens or input_tokens + output_tokens,
    )

