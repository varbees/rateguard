from __future__ import annotations

from dataclasses import replace

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
        # Clamp to non-negative: a token count is non-negative by definition, so
        # a hostile provider reporting output_tokens=-1_000_000 must not survive
        # — committing it would DECREASE recorded usage, an attacker-controlled
        # budget refund that lets a runaway agent spend past its cap. A negative
        # counts as "no usage" so the caller commits its reserved estimate.
        # (Python ints are arbitrary-precision, so there is no overflow-wrap
        # vector as in Go/Node; only the sign needs guarding.)
        if isinstance(value, bool):
            continue  # bool is an int subclass in Python; never a token count
        if isinstance(value, int):
            return max(0, value)
        if isinstance(value, str) and value.strip().lstrip("-").isdigit():
            return max(0, int(value.strip()))
    return 0


def merge_usage_max(base: TokenUsage, addition: TokenUsage) -> TokenUsage:
    """Merge usage with max semantics, matching the Go and Node SDKs.

    Streaming providers repeat and refine usage across events (Anthropic's
    message_start reports output_tokens=1, the final message_delta the real
    count; cache reads/writes arrive in message_start, OpenAI's in the final
    chunk). Summing would double-count. Per-field maxima can come from
    different events, so the cache counters are clamped back to subsets of
    the prompt afterwards.
    """
    input_tokens = max(base.input_tokens, addition.input_tokens)
    output_tokens = max(base.output_tokens, addition.output_tokens)
    cache_read = min(max(base.cache_read_tokens, addition.cache_read_tokens), input_tokens)
    cache_write = min(max(base.cache_write_tokens, addition.cache_write_tokens), input_tokens - cache_read)
    cache_write_long = min(max(base.cache_write_long_ttl_tokens, addition.cache_write_long_ttl_tokens), cache_write)
    return TokenUsage(
        provider=base.provider or addition.provider,
        model=base.model or addition.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=max(base.total_tokens, addition.total_tokens, input_tokens + output_tokens),
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
        cache_write_long_ttl_tokens=cache_write_long,
    )


def _is_number(value: JsonValue | None) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _usage_counters(usage: JsonObject) -> TokenUsage:
    """Read one provider usage object, normalising the prompt to its whole
    size (see TokenUsage). Mirrors readUsageCounters in Go and Node;
    conformance/usage_cache_vectors.json holds all three to the same answers."""
    # Aliases cover OpenAI (prompt/completion), Anthropic (input/output),
    # AWS Bedrock Converse (inputTokens/outputTokens — camelCase), Google.
    input_tokens = _first_int(usage, ["input_tokens", "prompt_tokens", "inputTokens", "promptTokenCount"])
    output_tokens = _first_int(usage, ["output_tokens", "completion_tokens", "outputTokens", "candidatesTokenCount"])
    total_tokens = _first_int(usage, ["total_tokens", "totalTokens", "totalTokenCount"])

    # Anthropic and Bedrock name their cache counters; OpenAI-shaped bodies
    # carry them in a details object.
    vendor_read = _first_int(usage, ["cache_read_input_tokens", "cacheReadInputTokens"])
    vendor_write = _first_int(usage, ["cache_creation_input_tokens", "cacheWriteInputTokens"])
    read = vendor_read or _first_int(usage, ["prompt_cache_hit_tokens", "cachedContentTokenCount"])
    write = vendor_write
    write_long_openai = 0
    details = _as_dict(usage.get("input_tokens_details")) or _as_dict(usage.get("prompt_tokens_details"))
    if details is not None:
        if read == 0:
            read = _first_int(details, ["cached_tokens"])
        if write == 0:
            write = _first_int(details, ["cache_write_tokens"])
        # OpenAI Responses: cache_write_tokens_details.{ttl_30m_tokens,ttl_12h_tokens}.
        write_details = _as_dict(details.get("cache_write_tokens_details"))
        if write_details is not None:
            write_long_openai = _first_int(write_details, ["ttl_12h_tokens"])

    # Long-TTL writes: Anthropic usage.cache_creation.ephemeral_1h_input_tokens,
    # Bedrock usage.cacheDetails[{ttl:"1h", inputTokens}], OpenAI above.
    write_long = 0
    write_by_ttl = 0
    creation = _as_dict(usage.get("cache_creation"))
    cache_details = usage.get("cacheDetails")
    if creation is not None:
        write_long = _first_int(creation, ["ephemeral_1h_input_tokens"])
        write_by_ttl = _first_int(creation, ["ephemeral_5m_input_tokens"]) + write_long
    elif isinstance(cache_details, list):
        for item in cache_details:
            detail = _as_dict(item)
            if detail is None:
                continue
            n = _first_int(detail, ["inputTokens"])
            write_by_ttl += n
            if detail.get("ttl") == "1h":
                write_long += n
    write_long = max(write_long, write_long_openai)
    if write == 0:
        write = write_by_ttl
        if write_by_ttl > 0:
            vendor_write = write_by_ttl

    # Additive shape: Anthropic/Bedrock input_tokens excludes cache reads and
    # writes. A body that also carries prompt_tokens or promptTokenCount
    # (OpenAI, LiteLLM's proxy, Gemini) already reports the whole prompt.
    has_prompt = _is_number(usage.get("prompt_tokens")) or _is_number(usage.get("promptTokenCount"))
    if not has_prompt and (vendor_read > 0 or vendor_write > 0):
        input_tokens += read + write
    else:
        # Subsets of the reported prompt: a hostile or malformed body must not
        # claim more cached tokens than prompt tokens.
        read = min(read, input_tokens)
        write = min(write, input_tokens - read)
    return TokenUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        cache_read_tokens=read,
        cache_write_tokens=write,
        cache_write_long_ttl_tokens=min(write_long, write),
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
    counters = _usage_counters(usage_source)
    input_tokens = counters.input_tokens
    output_tokens = counters.output_tokens
    total_tokens = counters.total_tokens

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
                aggregate = replace(aggregate, model=model)
        return aggregate

    return replace(
        counters,
        provider=provider,
        model=model,
        total_tokens=max(total_tokens, input_tokens + output_tokens),
    )
