"""Per-request budget estimation.

A hard-stop reservation bounds how much budget one in-flight call holds.
Reserve too little and concurrent callers can collectively overshoot the limit;
reserve everything and calls serialize.

The outbound transport used to reserve a flat 4096 tokens for every call,
chosen once at construction — before any request existed. Measured under
concurrency (see the Go SDK's ``token_budget_concurrency_test.go``), overshoot
is bounded by::

    overshoot <= limit * (actual / estimate)

So the overshoot factor is exactly how wrong the estimate is. A flat 4096 is
fine for a typical chat call and ~25x wrong for a 100K-token RAG call, which
makes long-context agents — the workload most able to burn a budget — the
workload least protected by it. That is backwards, and it is the
denial-of-wallet hole this module closes.

The transport already buffers and JSON-parses the request body for model
detection and fallback retry, so the prompt is in hand::

    estimate = tokens(prompt text) + declared output ceiling

The prompt is measurable exactly. The completion is not knowable up front, but
the request usually declares its own ceiling (``max_tokens`` /
``max_completion_tokens`` / ``maxOutputTokens``) — providers do not exceed it,
so it is a true upper bound rather than a guess.

Bias: this deliberately OVER-estimates rather than under. Over-reserving costs
concurrency; under-reserving costs money. Only one is a security property.
"""

from __future__ import annotations

import json
from typing import Any

from .tokenizer import Tokenizer, estimate_with

# Reserved for the completion when a request declares no ceiling of its own.
# Providers default to "until the model stops", so there is no true bound to
# read — this is an allowance, not a measurement, and the one guess left.
DEFAULT_OUTPUT_ALLOWANCE = 4096

# Caps the body size this will parse. Beyond it, fall back to reserve-all (the
# safe direction) rather than spend unbounded CPU on the hot path.
MAX_ESTIMATE_BODY_BYTES = 4 << 20  # 4 MiB


def _content_text(raw: Any) -> str:
    """Text out of a content field: a string, typed parts, or bare strings."""
    if isinstance(raw, str):
        return raw
    if not isinstance(raw, list):
        return ""
    out: list[str] = []
    for part in raw:
        if isinstance(part, str):
            out.append(part)
        elif isinstance(part, dict):
            # Non-text parts (images, audio) are skipped: their token cost is
            # provider-specific and not derivable from the request bytes.
            text = part.get("text")
            if isinstance(text, str):
                out.append(text)
    return "\n".join(out)


def _whole_body_upper_bound(text: str, tokenizer: Tokenizer | None) -> int:
    """Bound an unrecognized request by its own size.

    The prompt is necessarily a subset of the body, so counting every byte as
    prompt text cannot under-count. It over-counts by the JSON scaffolding,
    which is the direction that protects the budget.
    """
    return estimate_with(tokenizer, text) + DEFAULT_OUTPUT_ALLOWANCE


def _ceiling(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def estimate_request_tokens(body: bytes | None, tokenizer: Tokenizer | None = None) -> int:
    """Derive a budget reservation from the request itself.

    Measured prompt tokens plus the output ceiling the request declares.

    Unknown schemas do NOT fall back to reserve-all. Reserve-all serializes
    every call on the budget key, so one unrecognized request shape would
    quietly throttle a whole application on upgrade — trading a cost bug for an
    availability bug. Unparseable bodies are bounded by their size instead.

    Returns 0 ("reserve the entire remaining budget") only for an empty body or
    one too large to walk — both pathological for an LLM call.

    Non-text modalities (images, audio) are not counted; their cost is not
    derivable from the request bytes. For those workloads set
    ``estimated_tokens`` explicitly.
    """
    if not body or len(body) > MAX_ESTIMATE_BODY_BYTES:
        return 0

    try:
        text = body.decode("utf-8", errors="replace")
    except Exception:  # pragma: no cover - decode with errors="replace" cannot raise
        return 0

    try:
        payload = json.loads(text)
    except (ValueError, TypeError):
        return _whole_body_upper_bound(text, tokenizer)

    if not isinstance(payload, dict):
        return _whole_body_upper_bound(text, tokenizer)

    chunks: list[str] = []

    # OpenAI chat completions.
    messages = payload.get("messages")
    if isinstance(messages, list):
        for message in messages:
            if isinstance(message, dict):
                content = _content_text(message.get("content"))
                if content:
                    chunks.append(content)

    # OpenAI legacy completions / embeddings; Anthropic system.
    for key in ("prompt", "input", "system"):
        content = _content_text(payload.get(key))
        if content:
            chunks.append(content)

    # Google Gemini.
    contents = payload.get("contents")
    if isinstance(contents, list):
        for entry in contents:
            if isinstance(entry, dict):
                content = _content_text(entry.get("parts"))
                if content:
                    chunks.append(content)
    system_instruction = payload.get("systemInstruction")
    if isinstance(system_instruction, dict):
        content = _content_text(system_instruction.get("parts"))
        if content:
            chunks.append(content)

    prompt_text = "\n".join(chunks)
    if not prompt_text:
        # Valid JSON carrying no field we recognize as a prompt: a newer API
        # shape, or a provider we have not taught this. Bound it by size rather
        # than serialize the caller.
        return _whole_body_upper_bound(text, tokenizer)

    input_tokens = estimate_with(tokenizer, prompt_text)

    generation_config = payload.get("generationConfig")
    max_output = (
        _ceiling(generation_config.get("maxOutputTokens"))
        if isinstance(generation_config, dict)
        else None
    )
    output_tokens = (
        _ceiling(payload.get("max_completion_tokens"))
        or _ceiling(payload.get("max_tokens"))
        or max_output
        or DEFAULT_OUTPUT_ALLOWANCE
    )

    return input_tokens + output_tokens
