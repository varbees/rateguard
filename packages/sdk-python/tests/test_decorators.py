from __future__ import annotations

import pytest

from rateguard import RateGuardException, token_budget


class _Response:
    def __init__(self, tokens: int) -> None:
        self.usage = type("_Usage", (), {"total_tokens": tokens})()


@pytest.mark.asyncio
async def test_token_budget_decorator_blocks_when_exhausted() -> None:
    calls: list[str] = []

    @token_budget(hard_stop=True, monthly_limit=1)
    async def call_llm() -> _Response:
        calls.append("called")
        return _Response(1)

    result = await call_llm()
    assert isinstance(result, _Response)
    assert calls == ["called"]

    with pytest.raises(RateGuardException):
        await call_llm()

