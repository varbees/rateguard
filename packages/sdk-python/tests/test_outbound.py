"""Outbound transport tests — mirrors Go's outbound_test.go and Node's outbound.test.ts."""

from __future__ import annotations

import json

import httpx
import pytest

from rateguard import FallbackProvider, RateGuard, TokenBudgetOptions, detect_llm_call
from rateguard.core.outbound import create_httpx_transport


def openai_body(model: str, prompt: int, completion: int) -> dict:
    return {
        "id": "cmpl-1",
        "model": model,
        "choices": [{"message": {"content": "hi"}}],
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": prompt + completion},
    }


def make_client(rg: RateGuard, handler, **kwargs) -> httpx.Client:
    transport = create_httpx_transport(rg.runtime, transport=httpx.MockTransport(handler), **kwargs)
    return httpx.Client(transport=transport)


def test_detect_llm_call_matrix():
    cases = [
        ("api.openai.com", "/v1/chat/completions", "openai", True),
        ("api.anthropic.com", "/v1/messages", "anthropic", False),
        ("generativelanguage.googleapis.com", "/v1beta/openai/chat/completions", "google", True),
        ("myres.openai.azure.com", "/openai/deployments/gpt4o/chat/completions", "azure_openai", True),
        ("bedrock-runtime.us-east-1.amazonaws.com", "/model/meta.llama3-70b/invoke", "aws_bedrock", False),
        ("api.groq.com", "/openai/v1/chat/completions", "groq", True),
        ("my-vllm.internal", "/v1/chat/completions", "my-vllm.internal", True),
        # New providers this round — every path below is the real path shape
        # from that provider's own current API docs, not a guess.
        ("api.deepinfra.com", "/v1/openai/chat/completions", "deepinfra", True),
        ("router.huggingface.co", "/v1/chat/completions", "huggingface", True),
        ("inference.baseten.co", "/v1/chat/completions", "baseten", True),
        ("api.tokenfactory.nebius.com", "/v1/chat/completions", "nebius", True),
        ("api.z.ai", "/api/paas/v4/chat/completions", "zai", True),
        ("open.bigmodel.cn", "/api/paas/v4/chat/completions", "zai", True),
        ("api.siliconflow.com", "/v1/chat/completions", "siliconflow", True),
        ("api.siliconflow.cn", "/v1/chat/completions", "siliconflow", True),
        ("router.requesty.ai", "/v1/chat/completions", "requesty", True),
        ("models.github.ai", "/inference/chat/completions", "github", True),
    ]
    for host, path, provider, compatible in cases:
        call = detect_llm_call(host, path)
        assert call is not None, f"{host}{path} not detected"
        assert call.provider == provider
        assert call.compatible is compatible

    assert detect_llm_call("api.stripe.com", "/v1/charges") is None


def test_outbound_tracks_json_usage():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_body("gpt-4o", 100, 50))

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=10_000))
    client = make_client(rg, handler)

    resp = client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o", "messages": []})
    assert resp.status_code == 200
    assert resp.json()["usage"]["total_tokens"] == 150

    key = f"{rg.runtime.config.tenant_id}:openai:gpt-4o:outbound"
    usage = rg.runtime.token_budget.usage(key, rg.runtime.config.token_budget)
    assert usage["hour"] == 150


def test_outbound_sse_streaming_usage_preserves_bytes():
    sse = "\n".join([
        'data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"He"}}],"usage":null}',
        "",
        'data: {"id":"c1","model":"gpt-4o","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":25,"total_tokens":35}}',
        "",
        "data: [DONE]",
        "",
    ])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse.encode())

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=10_000))
    client = make_client(rg, handler)

    received = b""
    with client.stream("POST", "https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o", "stream": True}) as resp:
        for chunk in resp.iter_bytes():
            received += chunk

    assert received == sse.encode(), "SSE bytes must pass through unchanged"

    key = f"{rg.runtime.config.tenant_id}:openai:gpt-4o:outbound"
    usage = rg.runtime.token_budget.usage(key, rg.runtime.config.token_budget)
    assert usage["hour"] == 35


def test_outbound_anthropic_split_usage_merges_max():
    sse = "\n".join([
        "event: message_start",
        'data: {"type":"message_start","message":{"id":"m1","model":"claude-sonnet-4","usage":{"input_tokens":42,"output_tokens":1}}}',
        "",
        "event: message_delta",
        'data: {"type":"message_delta","usage":{"output_tokens":88}}',
        "",
    ])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse.encode())

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=10_000))
    client = make_client(rg, handler)

    with client.stream("POST", "https://api.anthropic.com/v1/messages", json={"model": "claude-sonnet-4"}) as resp:
        resp.read()

    key = f"{rg.runtime.config.tenant_id}:anthropic:claude-sonnet-4:outbound"
    usage = rg.runtime.token_budget.usage(key, rg.runtime.config.token_budget)
    # 42 input + max(1, 88) output = 130 — summing would give 131.
    assert usage["hour"] == 130


def test_outbound_budget_enforcement():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_body("gpt-4o", 400, 100))

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=600))
    client = make_client(rg, handler)

    def send() -> httpx.Response:
        return client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"})

    assert send().status_code == 200
    assert send().status_code == 200  # 100 of 600 remains
    blocked = send()  # used 1000 of 600 — exhausted
    assert blocked.status_code == 429
    assert blocked.headers.get("x-rateguard-synthesized") == "true"
    assert "retry-after" in blocked.headers


def test_outbound_observe_mode_never_blocks():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_body("gpt-4o", 400, 100))

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=100))
    client = make_client(rg, handler, mode="observe")

    for _ in range(3):
        resp = client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"})
        assert resp.status_code == 200

    key = f"{rg.runtime.config.tenant_id}:openai:gpt-4o:outbound"
    assert rg.runtime.token_budget.usage(key, rg.runtime.config.token_budget)["hour"] == 1500


def test_outbound_provider_fallback():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        seen.append({
            "url": str(request.url),
            "auth": request.headers.get("authorization"),
            "model": body.get("model", ""),
        })
        if body.get("model") == "deepseek-chat":
            return httpx.Response(200, json=openai_body("deepseek-chat", 10, 5))
        return httpx.Response(429, json={"error": {"message": "rate limited"}})

    rg = RateGuard(preset="dev")
    client = make_client(
        rg,
        handler,
        chain=[FallbackProvider(name="deepseek", base_url="https://api.deepseek.com/v1", model="deepseek-chat", headers={"Authorization": "Bearer fallback-key"})],
    )

    resp = client.post(
        "https://api.openai.com/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": "Bearer primary-key"},
    )

    assert resp.status_code == 200
    assert resp.headers.get("x-rateguard-fallback") == "true"
    assert len(seen) == 2
    assert seen[1]["url"] == "https://api.deepseek.com/v1/chat/completions"
    assert seen[1]["auth"] == "Bearer fallback-key"
    assert seen[1]["model"] == "deepseek-chat"


def test_outbound_fallback_strips_azure_api_key():
    """Reproduces a real credential-leak bug: Azure OpenAI authenticates
    via a bare "api-key" header (not "authorization" or "x-api-key"),
    which retarget's credential-stripping list previously missed
    entirely. Failing over from Azure to another provider that doesn't
    set its own api-key header used to forward the Azure key verbatim."""
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        seen.append({"url": str(request.url), "api_key": request.headers.get("api-key"), "model": body.get("model", "")})
        if body.get("model") == "deepseek-chat":
            return httpx.Response(200, json=openai_body("deepseek-chat", 10, 5))
        return httpx.Response(429, json={"error": {"message": "rate limited"}})

    rg = RateGuard(preset="dev")
    # Deliberately no headers on the fallback target — the only way this
    # test can fail is if the primary's Azure key leaks through uncleaned.
    client = make_client(
        rg,
        handler,
        chain=[FallbackProvider(name="deepseek", base_url="https://api.deepseek.com/v1", model="deepseek-chat")],
    )

    resp = client.post(
        "https://myres.openai.azure.com/openai/deployments/gpt4o/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"api-key": "azure-secret-key"},
    )

    assert resp.status_code == 200
    assert len(seen) == 2
    assert seen[1]["api_key"] is None


def test_preset_provider_chains_are_usable_and_openai_compatible():
    """Reproduces a real bug: default_provider_chain/budget_provider_chain/
    quality_provider_chain used to return a ProviderChain instance, but the
    real outbound transport's chain= parameter indexes a plain
    list[FallbackProvider] (see core/outbound.py: `self.chain[depth]`).
    Passing the ProviderChain instance through crashed the moment a
    fallback was actually attempted: `TypeError: object of type
    'ProviderChain' has no len()`. Confirmed by actually forcing a
    429-triggered fallback through a mocked transport, not by inspection.

    Separately, an earlier version of all three chains included a raw
    "anthropic" entry pointed at Anthropic's native base URL — but
    retarget appends "/chat/completions" and resends the same OpenAI-
    shaped body, which Anthropic's real Messages API (/v1/messages, a
    different schema) would reject. Both bugs fixed together: every
    chain now returns plain FallbackProvider objects, all genuinely
    OpenAI-compatible."""
    from rateguard.core.provider_chain import budget_provider_chain, default_provider_chain, quality_provider_chain

    for factory in (default_provider_chain, budget_provider_chain, quality_provider_chain):
        chain = factory()
        assert isinstance(chain, list)
        for entry in chain:
            assert isinstance(entry, FallbackProvider)
            assert entry.name != "anthropic", f"{factory.__name__} includes a raw anthropic entry — no OpenAI-compatible endpoint exists for it"

    def handler(request: httpx.Request) -> httpx.Response:
        if "openai.com" in str(request.url):
            return httpx.Response(429, json={"error": {"message": "rate limited"}})
        return httpx.Response(200, json=openai_body("gemini-2.5-flash", 5, 3))

    rg = RateGuard(preset="dev")
    client = make_client(rg, handler, chain=default_provider_chain())

    resp = client.post(
        "https://api.openai.com/v1/chat/completions",
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 200
    assert resp.headers.get("x-rateguard-fallback") == "true"


def test_outbound_passthrough_non_llm():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, text="plain")

    rg = RateGuard(preset="dev")
    client = make_client(rg, handler)

    resp = client.get("https://example.com/healthz")
    assert resp.text == "plain"
    assert len(calls) == 1


def test_wrap_httpx_client_facade():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_body("gpt-4o", 5, 5))

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=1000))
    # The facade builds a working client (transport injection verified via
    # create_httpx_transport above; here we check the public entry point).
    client = rg.wrap_httpx_client()
    assert isinstance(client, httpx.Client)
    client.close()


# ── Async transport (agent frameworks are async-first) ──

from rateguard.core.outbound import create_httpx_async_transport


def make_async_client(rg: RateGuard, handler, **kwargs) -> httpx.AsyncClient:
    transport = create_httpx_async_transport(rg.runtime, transport=httpx.MockTransport(handler), **kwargs)
    return httpx.AsyncClient(transport=transport)


@pytest.mark.anyio
async def test_async_outbound_tracks_json_usage():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_body("gpt-4o", 100, 50))

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=10_000))
    async with make_async_client(rg, handler) as client:
        resp = await client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"})
        assert resp.status_code == 200

    key = f"{rg.runtime.config.tenant_id}:openai:gpt-4o:outbound"
    assert rg.runtime.token_budget.usage(key, rg.runtime.config.token_budget)["hour"] == 150


@pytest.mark.anyio
async def test_async_outbound_sse_streaming():
    sse = "\n".join([
        'data: {"model":"gpt-4o","choices":[{"delta":{"content":"He"}}],"usage":null}',
        "",
        'data: {"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":25,"total_tokens":35}}',
        "",
        "data: [DONE]",
        "",
    ])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse.encode())

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=10_000))
    async with make_async_client(rg, handler) as client:
        received = b""
        async with client.stream("POST", "https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"}) as resp:
            async for chunk in resp.aiter_bytes():
                received += chunk

    assert received == sse.encode(), "SSE bytes must pass through unchanged"
    key = f"{rg.runtime.config.tenant_id}:openai:gpt-4o:outbound"
    assert rg.runtime.token_budget.usage(key, rg.runtime.config.token_budget)["hour"] == 35


@pytest.mark.anyio
async def test_async_outbound_budget_blocks():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_body("gpt-4o", 400, 100))

    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=600))
    async with make_async_client(rg, handler) as client:
        assert (await client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"})).status_code == 200
        assert (await client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"})).status_code == 200
        blocked = await client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"})
        assert blocked.status_code == 429
        assert blocked.headers.get("x-rateguard-synthesized") == "true"


@pytest.mark.anyio
async def test_async_outbound_fallback():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        if body.get("model") == "deepseek-chat":
            return httpx.Response(200, json=openai_body("deepseek-chat", 10, 5))
        return httpx.Response(429, json={"error": {"message": "rate limited"}})

    rg = RateGuard(preset="dev")
    async with make_async_client(
        rg,
        handler,
        chain=[FallbackProvider(name="deepseek", base_url="https://api.deepseek.com/v1", model="deepseek-chat")],
    ) as client:
        resp = await client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"})
        assert resp.status_code == 200
        assert resp.headers.get("x-rateguard-fallback") == "true"


@pytest.mark.anyio
async def test_wrap_httpx_async_client_facade():
    rg = RateGuard(preset="dev")
    client = rg.wrap_httpx_async_client()
    assert isinstance(client, httpx.AsyncClient)
    await client.aclose()
