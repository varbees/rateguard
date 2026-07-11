"""Enforcement audit trail: RateGuard records every intervention on an
outbound call — budget stops, rate limits, freezes — newest first, with
timestamps, queryable in-process and over the admin API. Mirrors Go's
enforcement_log_test.go and Node's enforcement-log.test.ts."""

from __future__ import annotations

import httpx

from rateguard import RateGuard, TokenBudgetOptions
from rateguard.core.outbound import create_httpx_transport


def _body(model: str, prompt: int, completion: int) -> dict:
    return {
        "model": model,
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": prompt + completion},
    }


def _ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=_body("gpt-4o", 400, 100))


def _client(rg: RateGuard) -> httpx.Client:
    transport = create_httpx_transport(rg.runtime, transport=httpx.MockTransport(_ok))
    return httpx.Client(transport=transport)


def _send(client: httpx.Client, customer: str) -> httpx.Response:
    return client.post(
        "https://api.openai.com/v1/chat/completions",
        json={"model": "gpt-4o"},
        headers={"X-RateGuard-Customer": customer},
    )


def test_records_budget_stops_and_freezes_newest_first() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=600))
    client = _client(rg)

    assert _send(client, "alice").status_code == 200  # 500 used
    assert _send(client, "alice").status_code == 200  # 1000 used
    assert _send(client, "alice").status_code == 429  # exhausted -> token_budget_exceeded
    rg.freeze("bob")
    assert _send(client, "bob").status_code == 403  # frozen

    events = rg.enforcement_events()
    assert len(events) >= 2
    assert events[0].type == "frozen"  # newest first
    assert events[0].customer == "bob"
    assert events[0].at.count("-") >= 2 and "T" in events[0].at  # ISO-8601 timestamp
    assert any(e.type == "token_budget_exceeded" and e.customer == "alice" for e in events)


def test_limit_caps_returned_events() -> None:
    rg = RateGuard(preset="dev", token_budget=TokenBudgetOptions(hour_limit=100_000))
    rg.freeze("a")
    rg.freeze("b")
    client = _client(rg)
    _send(client, "a")
    _send(client, "b")

    assert len(rg.enforcement_events(1)) == 1
    assert len(rg.enforcement_events(0)) == 2  # 0 == all
