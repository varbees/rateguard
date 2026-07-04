from __future__ import annotations

import pytest

from rateguard import BudgetExceeded, RateGuard, TokenBudget
from rateguard.types import ResponseSnapshot

from .helpers import FixedClock, RecorderEmitter, Usage


@pytest.mark.asyncio
async def test_token_budget_hard_stop_blocks_before_call() -> None:
    emitter = RecorderEmitter()
    budget = TokenBudget(
        clock=FixedClock(),
        hour_limit=0,
        day_limit=0,
        month_limit=10,
        mode="hard-stop",
        soft_stop_at=0.8,
        event_emitter=emitter,
    )
    budget.record("user:one", 10)

    with pytest.raises(BudgetExceeded):
        async with budget.enforce("user:one"):
            raise AssertionError("should not execute")

    assert emitter.events == []


def test_token_budget_reservation_prevents_concurrent_double_spend() -> None:
    budget = TokenBudget(
        clock=FixedClock(),
        hour_limit=0,
        day_limit=0,
        month_limit=100,
        mode="hard-stop",
        soft_stop_at=0.8,
        event_emitter=RecorderEmitter(),
    )

    first = budget.reserve("user:one")
    assert first.decision.allowed is True
    assert first.reservation_id is not None

    second = budget.reserve("user:one")
    assert second.decision.allowed is False

    budget.commit_reservation("user:one", first.reservation_id, 17)
    assert budget.check("user:one").remaining == 83


@pytest.mark.asyncio
async def test_token_budget_soft_stop_allows_without_emitting_control_plane_events() -> None:
    emitter = RecorderEmitter()
    budget = TokenBudget(
        clock=FixedClock(),
        hour_limit=0,
        day_limit=0,
        month_limit=10,
        mode="soft-stop",
        soft_stop_at=0.8,
        event_emitter=emitter,
    )
    budget.record("user:one", 8)

    decision = budget.check("user:one")
    assert decision.allowed is True
    assert decision.warning is True

    async with budget.enforce("user:one"):
        pass

    assert emitter.events == []


@pytest.mark.asyncio
async def test_token_budget_streaming_extracts_openai_and_anthropic_usage() -> None:
    clock = FixedClock()
    budget = TokenBudget(
        clock=clock,
        hour_limit=0,
        day_limit=0,
        month_limit=100,
        mode="hard-stop",
        soft_stop_at=0.8,
        event_emitter=RecorderEmitter(),
    )

    async def openai_stream():
        yield 'data: {"usage":{"total_tokens":7,"input_tokens":2,"output_tokens":5}}\n\n'

    async for _ in budget.track_stream(openai_stream(), "openai-user"):
        pass

    usage = budget.usage("openai-user")
    assert usage["month"] == 7

    async def anthropic_stream():
        yield 'data: {"usage":{"input_tokens":2,"output_tokens":5,"total_tokens":7}}\n\n'

    async for _ in budget.track_stream(anthropic_stream(), "anthropic-user"):
        pass

    usage = budget.usage("anthropic-user")
    assert usage["month"] == 7


def test_token_budget_extracts_response_header_usage() -> None:
    budget = TokenBudget(
        clock=FixedClock(),
        hour_limit=0,
        day_limit=0,
        month_limit=100,
        mode="hard-stop",
        soft_stop_at=0.8,
        event_emitter=RecorderEmitter(),
    )

    usage = budget.record_from_snapshot(
        "header-user",
        ResponseSnapshot(
            headers={
                "x-rateguard-provider": "openai",
                "x-rateguard-model": "gpt-4.1",
                "x-rateguard-input-tokens": "2",
                "x-rateguard-output-tokens": "3",
                "x-rateguard-total-tokens": "5",
            },
            body="",
            status_code=200,
        ),
    )

    assert usage is not None
    assert usage.provider == "openai"
    assert usage.model == "gpt-4.1"
    assert usage.total_tokens == 5
    assert budget.usage("header-user")["month"] == 5


def test_token_budget_logs_malformed_json_payloads(caplog: pytest.LogCaptureFixture) -> None:
    budget = TokenBudget(
        clock=FixedClock(),
        hour_limit=0,
        day_limit=0,
        month_limit=100,
        mode="hard-stop",
        soft_stop_at=0.8,
        event_emitter=RecorderEmitter(),
    )

    with caplog.at_level("WARNING"):
        usage = budget.record_from_snapshot(
            "bad-json-user",
            ResponseSnapshot(headers={}, body='{"usage":{"total_tokens":7}', status_code=200),
        )

    assert usage is None
    assert "RateGuard failed to parse token usage JSON payload" in caplog.text
