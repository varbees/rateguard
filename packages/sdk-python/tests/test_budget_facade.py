from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from rateguard import BudgetExceeded, RateGuard, TokenBudgetOptions

from .helpers import FixedClock


@pytest.mark.asyncio
async def test_budget_facade_hard_stop_raises_human_readable_budget_exceeded() -> None:
    started_at = datetime(2026, 3, 1, tzinfo=timezone.utc)
    clock = FixedClock(start_ms=started_at.timestamp() * 1000.0)
    guard = RateGuard(
        clock=clock,
        token_budget=TokenBudgetOptions(hour_limit=0, day_limit=0, month_limit=100_000, mode="hard-stop"),
    )
    guard.runtime.token_budget.record("me", 100_000)

    expected_retry_after = (started_at + timedelta(days=30)).isoformat().replace("+00:00", "Z")

    with pytest.raises(BudgetExceeded) as excinfo:
        async with guard.budget.enforce(user_id="me", hard_stop=True):
            raise AssertionError("budget guard should stop the call before it starts")

    message = str(excinfo.value)
    assert message == (
        "Budget exhausted: 100,000 / 100,000 tokens used this month.\n"
        f"Retry after: {expected_retry_after}"
    )
