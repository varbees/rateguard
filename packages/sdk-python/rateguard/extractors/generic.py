from __future__ import annotations

from ..types import JsonObject, JsonValue, TokenUsage


def _as_dict(value: JsonValue | None) -> JsonObject | None:
    if isinstance(value, dict):
        return value
    return None


def _first_str(source: JsonObject, keys: list[str]) -> str | None:
    for key in keys:
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _first_int(source: JsonObject, keys: list[str]) -> int:
    for key in keys:
        value = source.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return 0


def merge_usage_max(base: TokenUsage, addition: TokenUsage) -> TokenUsage:
    """Merge usage with max semantics, matching the Go and Node SDKs.

    Streaming providers repeat and refine usage across events (Anthropic's
    message_start reports output_tokens=1, the final message_delta the real
    count). Summing would double-count.
    """
    input_tokens = max(base.input_tokens, addition.input_tokens)
    output_tokens = max(base.output_tokens, addition.output_tokens)
    return TokenUsage(
        provider=base.provider or addition.provider,
        model=base.model or addition.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=max(base.total_tokens, addition.total_tokens, input_tokens + output_tokens),
    )


def extract_token_usage_from_value(value: JsonValue | None) -> TokenUsage | None:
    if value is None:
        return None
    if isinstance(value, list):
        aggregate: TokenUsage | None = None
        for item in value:
            usage = extract_token_usage_from_value(item)
            if usage is None:
                continue
            aggregate = usage if aggregate is None else merge_usage_max(aggregate, usage)
        return aggregate
    record = _as_dict(value)
    if record is None:
        return None

    # Aliases cover OpenAI (prompt/completion), Anthropic (input/output),
    # AWS Bedrock Converse (inputTokens/outputTokens — camelCase), Google.
    usage_source = _as_dict(record.get("usage")) or _as_dict(record.get("usageMetadata")) or record
    input_tokens = _first_int(usage_source, ["input_tokens", "prompt_tokens", "inputTokens", "promptTokenCount"])
    output_tokens = _first_int(usage_source, ["output_tokens", "completion_tokens", "outputTokens", "candidatesTokenCount"])
    total_tokens = _first_int(usage_source, ["total_tokens", "totalTokens", "totalTokenCount"])

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
            aggregate = merge_usage_max(aggregate, usage)
        if aggregate is not None and not aggregate.model:
            model = _first_str(record, ["model"])
            if model:
                aggregate = TokenUsage(
                    provider=aggregate.provider,
                    model=model,
                    input_tokens=aggregate.input_tokens,
                    output_tokens=aggregate.output_tokens,
                    total_tokens=aggregate.total_tokens,
                )
        return aggregate

    return TokenUsage(
        provider=provider,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens or input_tokens + output_tokens,
    )
