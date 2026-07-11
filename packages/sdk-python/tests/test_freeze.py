"""Runtime kill switch: freeze halts outbound calls (global or per-customer),
respects observe mode, and is triggerable from the admin API."""

from __future__ import annotations

from typing import Any

import httpx

from rateguard import RateGuard, TokenBudgetOptions
from rateguard.core.outbound import create_httpx_transport


def _ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={"model": "gpt-4o", "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}},
    )


def _client(rg: RateGuard, **kwargs: Any) -> httpx.Client:
    transport = create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_ok), **kwargs)
    return httpx.Client(transport=transport)


def _send(client: httpx.Client, customer: str = "") -> httpx.Response:
    headers = {"X-RateGuard-Customer": customer} if customer else {}
    return client.post("https://api.openai.com/v1/chat/completions", json={"model": "gpt-4o"}, headers=headers)


def test_freeze_global_halts_then_resumes() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=100_000))
    client = _client(rg)

    assert _send(client).status_code == 200

    rg.freeze()
    assert rg.is_frozen() is True
    blocked = _send(client)
    assert blocked.status_code == 403
    assert blocked.headers.get("x-rateguard-synthesized") == "true"

    rg.unfreeze()
    assert _send(client).status_code == 200


def test_freeze_per_customer_is_scoped() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=100_000))
    client = _client(rg)

    rg.freeze("alice")
    assert _send(client, "alice").status_code == 403
    assert _send(client, "bob").status_code == 200
    assert rg.frozen_scopes() == ["customer=alice"]


def test_freeze_ignored_in_observe_mode() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=100_000))
    client = _client(rg, mode="observe")

    rg.freeze()
    assert _send(client).status_code == 200
