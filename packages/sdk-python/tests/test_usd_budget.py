"""USD budgets (0.6): the shared conformance vectors, then the public surface
(httpx transports + usd_budget_state). Mirrors Go's usd_budget_test.go and
Node's usd-budget.test.ts and conformance.test.ts."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from rateguard import (
    ModelPrice,
    RateGuard,
    StaticPricing,
    TokenBudgetManager,
    TokenBudgetOptions,
    TokenUsage,
    USDBudgetOptions,
    cost_micro_usd,
    micro_rates,
    reserve_micro_usd,
    usd_budget_key,
    usd_to_micro,
)
from rateguard.core.outbound import create_httpx_async_transport, create_httpx_transport

VECTORS = json.loads((Path(__file__).resolve().parents[3] / "conformance" / "usd_budget_vectors.json").read_text())


def _price(p: dict) -> ModelPrice:
    return ModelPrice(
        p["promptUSDPer1K"],
        p["completionUSDPer1K"],
        p.get("cacheReadUSDPer1K", 0.0),
        p.get("cacheWriteUSDPer1K", 0.0),
        p.get("cacheWriteLongTTLUSDPer1K", 0.0),
    )


PRICES = {k: _price(v) for k, v in VECTORS["prices"].items()}


class _Clock:
    def __init__(self) -> None:
        self.t = 1_700_000_000_000.0

    def now(self) -> float:
        return self.t


def test_conformance_usd_to_micro():
    for c in VECTORS["usd_to_micro"]:
        assert usd_to_micro(c["usd"]) == c["micro"], c


def test_conformance_micro_rates():
    for c in VECTORS["micro_rates"]:
        r = micro_rates(PRICES[c["price"]])
        want = c["rates"]
        assert (r.input, r.output, r.cache_read, r.cache_write, r.cache_write_long_ttl) == (
            want["input"], want["output"], want["cacheRead"], want["cacheWrite"], want["cacheWriteLongTTL"]
        ), c


def test_conformance_reserve_and_cost():
    for c in VECTORS["reserve"]:
        assert reserve_micro_usd(micro_rates(PRICES[c["price"]]), c["promptTokens"], c["outputTokens"]) == c["micro"], c
    for c in VECTORS["cost"]:
        u = c["usage"]
        usage = TokenUsage(
            provider=None, model=None,
            input_tokens=u["inputTokens"], output_tokens=u["outputTokens"], total_tokens=u["inputTokens"] + u["outputTokens"],
            cache_read_tokens=u.get("cacheReadTokens", 0),
            cache_write_tokens=u.get("cacheWriteTokens", 0),
            cache_write_long_ttl_tokens=u.get("cacheWriteLongTTLTokens", 0),
        )
        assert cost_micro_usd(micro_rates(PRICES[c["price"]]), usage) == c["micro"], c


def test_conformance_keys():
    for c in VECTORS["keys"]:
        assert usd_budget_key(c["scope"], c["tenant"], c["customer"] or None, c["provider"], c["model"] or None) == c["key"], c


def test_conformance_sequence():
    seq = VECTORS["sequence"]
    m = TokenBudgetManager(clock=_Clock(), hour_limit=0, day_limit=seq["dayLimitMicro"], month_limit=0, mode="hard-stop")
    ids: dict[str, str | None] = {}
    for s in seq["steps"]:
        if s["op"] == "reserve":
            r = m.reserve("k", None, s["estimate"])
            assert r.decision.allowed == s["allowed"], s
            if s["allowed"]:
                assert r.reserved == s["reserved"] and r.decision.remaining == s["remaining"], s
            ids[s["id"]] = r.reservation_id
        elif s["op"] == "commit":
            m.commit_reservation("k", ids[s["id"]] if s["id"] else None, s["micro"])
        elif s["op"] == "release":
            m.release_reservation("k", ids[s["id"]])
        elif s["op"] == "check":
            d = m.check("k")
            assert d.remaining == s["remaining"], s
            if "allowed" in s:
                assert d.allowed == s["allowed"], s


# ── the public surface ──

PRICING = StaticPricing({"vec-full": PRICES["vec-full"], "vec-cheap": PRICES["vec-nocache"]})


def _handler(status: int = 200, calls: list[int] | None = None):
    def handle(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(1)
        if status != 200:
            return httpx.Response(status, text="boom")
        model = json.loads(request.content).get("model", "vec-full")
        return httpx.Response(200, json={
            "id": "c", "model": model, "choices": [{"message": {"content": "hi"}}],
            "usage": {"prompt_tokens": 1000, "completion_tokens": 200, "total_tokens": 1200},
        })
    return handle


def _rg(**usd) -> RateGuard:
    return RateGuard(
        preset="dev",
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=0),
        pricing_provider=PRICING,
        usd_budget=USDBudgetOptions(**usd),
    )


def _call(client: httpx.Client, model: str = "vec-full", customer: str | None = None) -> httpx.Response:
    headers = {"x-rateguard-customer": customer} if customer else {}
    return client.post("https://api.openai.com/v1/chat/completions", headers=headers,
                       json={"model": model, "max_tokens": 200, "messages": [{"role": "user", "content": "hello there"}]})


def test_commits_measured_cost():
    rg = _rg(day_limit_usd=1)
    client = httpx.Client(transport=create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_handler())))
    assert _call(client).status_code == 200
    s = rg.usd_budget_state()
    # 1000 * $3/M + 200 * $15/M = 6,000 micro-USD
    assert (s.applied, s.limit_micro_usd, s.remaining_micro_usd, s.key) == (True, 1_000_000, 994_000, f"{rg.runtime.config.tenant_id}:usd")


def test_denies_before_the_network():
    calls: list[int] = []
    rg = _rg(day_limit_usd=0.005)
    client = httpx.Client(transport=create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_handler(calls=calls))))
    _call(client)
    denied = _call(client)
    assert denied.status_code == 429 and len(calls) == 1
    assert denied.json()["error"]["type"] == "usd_budget_exceeded"
    assert rg.enforcement_events(1)[0].type == "usd_budget_exceeded"


def test_unpriced_model():
    calls: list[int] = []
    rg = _rg(day_limit_usd=1)
    client = httpx.Client(transport=create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_handler(calls=calls))))
    r = _call(client, "mystery-model-9")
    assert r.status_code == 429 and r.json()["error"]["type"] == "usd_price_unknown" and calls == []
    rg2 = _rg(day_limit_usd=1, unpriced="allow-uncounted")
    client2 = httpx.Client(transport=create_httpx_transport(rg2.runtime, transport=httpx.MockTransport(_handler(calls=calls))))
    _call(client2, "mystery-model-9")
    _call(client2, "mystery-model-9")
    assert len(calls) == 2 and rg2.usd_budget_state().remaining_micro_usd == 1_000_000
    assert sum(1 for e in rg2.enforcement_events() if e.type == "usd_unpriced_call") == 2


def test_scopes():
    rg = _rg(day_limit_usd=1)
    client = httpx.Client(transport=create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_handler())))
    _call(client, "vec-full", "acme")
    _call(client, "vec-cheap", "acme")
    _call(client, "vec-full", "globex")
    assert rg.usd_budget_state(customer="acme").remaining_micro_usd == 1_000_000 - 6_000 - 270
    assert rg.usd_budget_state(customer="globex").remaining_micro_usd == 1_000_000 - 6_000
    rgm = _rg(day_limit_usd=1, scope="model")
    clientm = httpx.Client(transport=create_httpx_transport(rgm.runtime, transport=httpx.MockTransport(_handler())))
    _call(clientm)
    assert rgm.usd_budget_state(provider="openai", model="vec-full").remaining_micro_usd == 994_000
    assert rgm.usd_budget_state(provider="openai", model="vec-cheap").remaining_micro_usd == 1_000_000


def test_releases_on_provider_failure():
    rg = _rg(day_limit_usd=1)
    client = httpx.Client(transport=create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_handler(status=500))))
    _call(client)
    assert rg.usd_budget_state().remaining_micro_usd == 1_000_000


def test_soft_stop_warns_never_denies():
    rg = _rg(day_limit_usd=0.007, mode="soft-stop")
    client = httpx.Client(transport=create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_handler())))
    assert _call(client).status_code == 200 and _call(client).status_code == 200
    s = rg.usd_budget_state()
    assert s.warning and s.allowed


def test_peek_never_reserves():
    rg = _rg(day_limit_usd=1)
    for _ in range(5):
        rg.usd_budget_state(customer="acme")
    assert rg.usd_budget_state(customer="acme").remaining_micro_usd == 1_000_000


def test_async_transport_settles_too():
    rg = _rg(day_limit_usd=1)

    async def run() -> int:
        transport = create_httpx_async_transport(rg.runtime, transport=httpx.MockTransport(_handler()))
        async with httpx.AsyncClient(transport=transport) as client:
            r = await client.post("https://api.openai.com/v1/chat/completions",
                                  json={"model": "vec-full", "max_tokens": 200, "messages": [{"role": "user", "content": "hi"}]})
            return r.status_code

    assert asyncio.run(run()) == 200
    assert rg.usd_budget_state().remaining_micro_usd == 994_000


def test_config():
    assert RateGuard(preset="dev").usd_budget_state().applied is False
    assert RateGuard(preset="dev", usd_budget=USDBudgetOptions()).usd_budget_state().applied is False
    for bad in (USDBudgetOptions(day_limit_usd=-1), USDBudgetOptions(day_limit_usd=float("nan")),
                USDBudgetOptions(day_limit_usd=1, scope="galaxy"), USDBudgetOptions(day_limit_usd=1, unpriced="maybe")):
        with pytest.raises(ValueError):
            RateGuard(usd_budget=bad)
