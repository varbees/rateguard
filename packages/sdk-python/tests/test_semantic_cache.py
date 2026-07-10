"""Semantic response caching tests — mirrors Go's semantic_cache_test.go."""

from __future__ import annotations

import json

import httpx
import pytest

from rateguard import RateGuard, SemanticCacheOptions, TokenBudgetOptions
from rateguard.core.outbound import create_httpx_async_transport, create_httpx_transport
from rateguard.core.semantic_cache import (
    CachedResponse,
    SemanticCache,
    is_streaming_request_body,
    prompt_text_from_request_body,
)

from .helpers import FixedClock


class _FakeEmbedder:
    """Deterministic stand-in embedder: same text -> same vector, near-
    duplicate text ("hi there" vs "hi there!") -> a highly similar
    vector, unrelated text -> an orthogonal vector."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def embed(self, text: str) -> list[float]:
        self.calls.append(text)
        normalized = text.strip().rstrip("!?.").lower()
        if "capital of france" in normalized:
            return [1.0, 0.01, 0.0]
        if "capital of japan" in normalized:
            return [0.0, 0.0, 1.0]
        return [0.5, 0.5, 0.5]


def make_client(rg: RateGuard, handler, **kwargs) -> httpx.Client:
    transport = create_httpx_transport(rg.runtime, transport=httpx.MockTransport(handler), **kwargs)
    return httpx.Client(transport=transport)


def make_async_client(rg: RateGuard, handler, **kwargs) -> httpx.AsyncClient:
    transport = create_httpx_async_transport(rg.runtime, transport=httpx.MockTransport(handler), **kwargs)
    return httpx.AsyncClient(transport=transport)


# ── is_streaming_request_body / prompt_text_from_request_body ──


def test_is_streaming_request_body():
    assert is_streaming_request_body('{"stream": true}') is True
    assert is_streaming_request_body('{"stream": false}') is False
    assert is_streaming_request_body("{}") is False
    assert is_streaming_request_body("") is False
    assert is_streaming_request_body("not json") is False


def test_prompt_text_from_request_body_extracts_system_and_messages():
    body = json.dumps({
        "system": "You are a helpful assistant.",
        "messages": [
            {"role": "user", "content": "What is the capital of France?"},
            {"role": "assistant", "content": "Paris."},
        ],
    })
    text = prompt_text_from_request_body(body)
    assert "system: You are a helpful assistant." in text
    assert "user: What is the capital of France?" in text
    assert "assistant: Paris." in text


def test_prompt_text_from_request_body_handles_content_parts_and_ignores_images():
    body = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this"},
                    {"type": "image_url", "image_url": {"url": "https://example.com/x.png"}},
                    {"type": "text", "text": "image."},
                ],
            }
        ]
    })
    text = prompt_text_from_request_body(body)
    assert "Describe this image." in text
    assert "image_url" not in text
    assert "example.com" not in text


def test_prompt_text_from_request_body_empty_on_malformed_or_empty_input():
    assert prompt_text_from_request_body("") == ""
    assert prompt_text_from_request_body("not json") == ""
    assert prompt_text_from_request_body("[]") == ""
    assert prompt_text_from_request_body('{"messages": []}') == ""


# ── SemanticCache engine ──


def test_semantic_cache_hit_on_similar_prompt_above_threshold():
    clock = FixedClock()
    cache = SemanticCache(SemanticCacheOptions(embedder=_FakeEmbedder(), similarity_threshold=0.9), clock)

    cache.store("openai:gpt-4o", [1.0, 0.0, 0.0], CachedResponse(status_code=200, headers={}, body=b"paris"))

    # A near-identical vector (cosine similarity > 0.9) should hit.
    hit = cache.lookup("openai:gpt-4o", [0.99, 0.05, 0.0])
    assert hit is not None
    assert hit.body == b"paris"


def test_semantic_cache_miss_below_threshold():
    clock = FixedClock()
    cache = SemanticCache(SemanticCacheOptions(embedder=_FakeEmbedder(), similarity_threshold=0.92), clock)
    cache.store("openai:gpt-4o", [1.0, 0.0, 0.0], CachedResponse(status_code=200, headers={}, body=b"paris"))

    miss = cache.lookup("openai:gpt-4o", [0.0, 1.0, 0.0])  # orthogonal
    assert miss is None


def test_semantic_cache_miss_on_empty_scope_or_unrelated_scope():
    clock = FixedClock()
    cache = SemanticCache(SemanticCacheOptions(embedder=_FakeEmbedder()), clock)
    assert cache.lookup("openai:gpt-4o", [1.0, 0.0, 0.0]) is None

    cache.store("openai:gpt-4o", [1.0, 0.0, 0.0], CachedResponse(status_code=200, headers={}, body=b"x"))
    assert cache.lookup("anthropic:claude-opus-4-5", [1.0, 0.0, 0.0]) is None


def test_semantic_cache_entries_expire_by_ttl():
    clock = FixedClock()
    cache = SemanticCache(SemanticCacheOptions(embedder=_FakeEmbedder(), ttl_ms=1_000), clock)
    cache.store("scope", [1.0, 0.0], CachedResponse(status_code=200, headers={}, body=b"x"))

    assert cache.lookup("scope", [1.0, 0.0]) is not None

    clock.advance(1_001)
    assert cache.lookup("scope", [1.0, 0.0]) is None


def test_semantic_cache_evicts_oldest_first_over_capacity():
    clock = FixedClock()
    cache = SemanticCache(SemanticCacheOptions(embedder=_FakeEmbedder(), max_entries_per_scope=2, similarity_threshold=0.99), clock)

    # Three orthogonal-ish vectors so lookups are unambiguous about which
    # entry (if any) survives.
    cache.store("scope", [1.0, 0.0, 0.0], CachedResponse(status_code=200, headers={}, body=b"first"))
    cache.store("scope", [0.0, 1.0, 0.0], CachedResponse(status_code=200, headers={}, body=b"second"))
    cache.store("scope", [0.0, 0.0, 1.0], CachedResponse(status_code=200, headers={}, body=b"third"))

    # Oldest ("first") was evicted; "second" and "third" remain.
    assert cache.lookup("scope", [1.0, 0.0, 0.0]) is None
    assert cache.lookup("scope", [0.0, 1.0, 0.0]).body == b"second"
    assert cache.lookup("scope", [0.0, 0.0, 1.0]).body == b"third"


def test_semantic_cache_options_with_defaults_normalizes_invalid_values():
    embedder = _FakeEmbedder()
    opts = SemanticCacheOptions(embedder=embedder, similarity_threshold=0, ttl_ms=-1, max_entries_per_scope=0).with_defaults()
    assert opts.similarity_threshold == 0.92
    assert opts.ttl_ms == 60 * 60 * 1000
    assert opts.max_entries_per_scope == 500
    assert opts.embedder is embedder


# ── Wired into the httpx transport ──


def test_outbound_semantic_cache_hit_skips_network():
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"id": "c1", "model": "gpt-4o", "choices": [{"message": {"content": "Paris"}}]})

    rg = RateGuard(preset="dev")
    embedder = _FakeEmbedder()
    client = make_client(rg, handler, semantic_cache=SemanticCacheOptions(embedder=embedder, similarity_threshold=0.9))

    body_1 = {"model": "gpt-4o", "messages": [{"role": "user", "content": "What is the capital of France?"}]}
    body_2 = {"model": "gpt-4o", "messages": [{"role": "user", "content": "what is the capital of france!"}]}

    first = client.post("https://api.openai.com/v1/chat/completions", json=body_1)
    assert first.status_code == 200
    assert call_count == 1
    assert first.headers.get("x-rateguard-cache") is None

    second = client.post("https://api.openai.com/v1/chat/completions", json=body_2)
    assert second.status_code == 200
    assert call_count == 1  # no second network call — served from cache
    assert second.headers.get("x-rateguard-cache") == "hit"
    assert second.json() == first.json()


def test_outbound_semantic_cache_scopes_fallback_response_to_the_serving_provider():
    """Reproduces a real gap: the scope key was computed from the
    REQUESTED provider/model before the call ran, but a fallback
    (retarget) never mutates the caller's `call` object — it builds an
    entirely new one for the recursive attempt. Caching a fallback answer
    under the pre-fallback scope meant a later request that reached the
    ORIGINAL (now-recovered) provider could get served the FALLBACK
    provider's stale, mislabeled answer instead of a fresh real one."""
    from rateguard import FallbackProvider

    primary_calls = 0
    fallback_calls = 0
    primary_should_fail = True

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal primary_calls, fallback_calls
        body = json.loads(request.content or b"{}")
        if body.get("model") == "deepseek-chat":
            fallback_calls += 1
            return httpx.Response(200, json={"id": "c1", "model": "deepseek-chat", "choices": []})
        primary_calls += 1
        if primary_should_fail:
            return httpx.Response(429, json={"error": {"message": "rate limited"}})
        return httpx.Response(200, json={"id": "c1", "model": "gpt-4o", "choices": []})

    rg = RateGuard(preset="dev")
    client = make_client(
        rg,
        handler,
        chain=[FallbackProvider(name="deepseek", base_url="https://api.deepseek.com/v1", model="deepseek-chat")],
        semantic_cache=SemanticCacheOptions(embedder=_FakeEmbedder(), similarity_threshold=0.9),
    )

    prompt = {"model": "gpt-4o", "messages": [{"role": "user", "content": "What is the capital of France?"}]}

    # Request 1: primary is down, falls back to deepseek. Gets cached — the
    # fix requires it be cached under deepseek's scope, not openai's.
    first = client.post("https://api.openai.com/v1/chat/completions", json=prompt)
    assert first.headers.get("x-rateguard-fallback") == "true"
    assert primary_calls == 1
    assert fallback_calls == 1

    # Primary has recovered. Request 2 (identical prompt -> identical
    # embedding) must NOT be served deepseek's cached answer as if it were
    # openai's — it must reach the network and get a fresh, real openai
    # response. If the bug were present (cached under "openai:gpt-4o"),
    # this would be a wrongful cache hit: primary_calls would stay at 1 and
    # the body would still say "deepseek-chat".
    primary_should_fail = False
    second = client.post("https://api.openai.com/v1/chat/completions", json=prompt)

    assert second.headers.get("x-rateguard-cache") != "hit"
    assert primary_calls == 2
    assert second.json()["model"] == "gpt-4o"


def test_outbound_semantic_cache_miss_on_dissimilar_prompt_still_calls_network():
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"id": "c1", "model": "gpt-4o", "choices": []})

    # Generous budget so this cache test isn't confounded by budget: these
    # no-usage responses now charge the reserved estimate (dev's 1k/hr budget
    # would otherwise block the second call). Cache behavior is what's under test.
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=1_000_000))
    client = make_client(rg, handler, semantic_cache=SemanticCacheOptions(embedder=_FakeEmbedder(), similarity_threshold=0.9))

    client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o", "messages": [{"role": "user", "content": "What is the capital of France?"}]})
    client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o", "messages": [{"role": "user", "content": "What is the capital of Japan?"}]})

    assert call_count == 2


def test_outbound_semantic_cache_never_caches_or_serves_streaming_requests():
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=b"data: [DONE]\n\n")

    # Generous budget so a streaming call with no usage (which now charges the
    # reserved estimate) doesn't exhaust dev's 1k/hr budget and block the second
    # request — this test is about cache bypass for streaming, not budget.
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=1_000_000))
    embedder = _FakeEmbedder()
    client = make_client(rg, handler, semantic_cache=SemanticCacheOptions(embedder=embedder, similarity_threshold=0.5))

    body = {"model": "gpt-4o", "stream": True, "messages": [{"role": "user", "content": "What is the capital of France?"}]}

    with client.stream("POST", "https://api.openai.com/v1/chat/completions", json=body) as resp1:
        resp1.read()
    with client.stream("POST", "https://api.openai.com/v1/chat/completions", json=body) as resp2:
        resp2.read()

    # Both requests hit the network for real — streaming bypasses the
    # cache entirely, and the embedder is never even called.
    assert call_count == 2
    assert embedder.calls == []


def test_outbound_without_semantic_cache_configured_never_calls_embedder():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": "c1", "model": "gpt-4o", "choices": []})

    rg = RateGuard(preset="dev")
    client = make_client(rg, handler)  # no semantic_cache kwarg at all

    resp = client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o", "messages": []})
    assert resp.status_code == 200
    assert resp.headers.get("x-rateguard-cache") is None


@pytest.mark.anyio
async def test_async_outbound_semantic_cache_hit_skips_network():
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"id": "c1", "model": "gpt-4o", "choices": [{"message": {"content": "Paris"}}]})

    rg = RateGuard(preset="dev")
    embedder = _FakeEmbedder()
    async with make_async_client(rg, handler, semantic_cache=SemanticCacheOptions(embedder=embedder, similarity_threshold=0.9)) as client:
        body_1 = {"model": "gpt-4o", "messages": [{"role": "user", "content": "What is the capital of France?"}]}
        body_2 = {"model": "gpt-4o", "messages": [{"role": "user", "content": "what is the capital of france!"}]}

        first = await client.post("https://api.openai.com/v1/chat/completions", json=body_1)
        assert first.status_code == 200
        assert call_count == 1

        second = await client.post("https://api.openai.com/v1/chat/completions", json=body_2)
        assert call_count == 1  # served from cache, no second network call
        assert second.headers.get("x-rateguard-cache") == "hit"
