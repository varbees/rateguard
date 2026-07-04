import pytest
from rateguard.core.mcp import LoopDetector


class TestLoopDetector:
    def test_identical_inputs_produce_identical_fingerprints(self) -> None:
        fp1 = LoopDetector.fingerprint("system-a", "user-input", "tool-defs")
        fp2 = LoopDetector.fingerprint("system-a", "user-input", "tool-defs")
        assert fp1 == fp2
        assert len(fp1) == 64

    def test_different_inputs_produce_different_fingerprints(self) -> None:
        fp1 = LoopDetector.fingerprint("system-a", "user-input", "")
        fp2 = LoopDetector.fingerprint("system-b", "user-input", "")
        assert fp1 != fp2

    def test_allows_first_occurrence(self) -> None:
        ld = LoopDetector(50)
        fp = LoopDetector.fingerprint("system", "hello", "")
        allowed, _ = ld.check(fp, 1)
        assert allowed is True

    def test_allows_same_depth_retry(self) -> None:
        ld = LoopDetector(50)
        fp = LoopDetector.fingerprint("system", "hello", "")
        ld.check(fp, 1)
        allowed, _ = ld.check(fp, 1)
        assert allowed is True

    def test_detects_loop_at_higher_depth(self) -> None:
        ld = LoopDetector(50)
        fp = LoopDetector.fingerprint("system", "hello", "")
        ld.check(fp, 1)
        allowed, reason = ld.check(fp, 2)
        assert allowed is False
        assert "loop detected" in reason

    def test_blocks_halted_permanently(self) -> None:
        ld = LoopDetector(50)
        fp = LoopDetector.fingerprint("system", "hello", "")
        ld.check(fp, 1)
        ld.check(fp, 2)  # halts
        allowed, reason = ld.check(fp, 3)
        assert allowed is False
        assert "previously blocked" in reason

    def test_different_fingerprints_independent(self) -> None:
        ld = LoopDetector(50)
        fp1 = LoopDetector.fingerprint("system", "task-a", "")
        fp2 = LoopDetector.fingerprint("system", "task-b", "")

        assert ld.check(fp1, 1)[0] is True
        assert ld.check(fp2, 1)[0] is True
        assert ld.check(fp1, 2)[0] is False  # fp1 loops
        assert ld.check(fp2, 1)[0] is True   # fp2 same depth, still ok

    def test_reset_clears_state(self) -> None:
        ld = LoopDetector(50)
        fp = LoopDetector.fingerprint("s", "u", "t")
        ld.check(fp, 1)
        ld.check(fp, 2)  # halts
        ld.reset()
        assert ld.check(fp, 1)[0] is True

    def test_stats(self) -> None:
        ld = LoopDetector(50)
        stats = ld.stats()
        assert stats["enabled"] is True
        assert stats["max_depth"] == 50
        assert stats["halted"] == 0

        fp = LoopDetector.fingerprint("s", "u", "t")
        ld.check(fp, 1)
        ld.check(fp, 2)  # halts
        assert ld.stats()["halted"] == 1

    def test_loop_check_convenience(self) -> None:
        ld = LoopDetector(50)
        allowed, _ = ld.loop_check("system", "user", "tools", 1)
        assert allowed is True


# ── MCP tools (parity with Go's mcp.go: 5 tools) ──

from rateguard import RateGuard, create_mcp_tools, mcp_call


def test_mcp_tools_expose_five_tools_matching_go():
    rg = RateGuard(preset="dev")
    names = sorted(tool.name for tool in rg.mcp_tools())
    assert names == [
        "check_loop",
        "get_circuit_breaker_state",
        "get_rate_limit_state",
        "get_token_budget",
        "list_limits",
    ]


def test_mcp_get_rate_limit_state_does_not_consume():
    import json

    rg = RateGuard(preset="dev")
    first = json.loads(rg.mcp_call("get_rate_limit_state", {"key": "agent-1"}).content[0]["text"])
    second = json.loads(rg.mcp_call("get_rate_limit_state", {"key": "agent-1"}).content[0]["text"])
    assert first["remaining"] == second["remaining"]


def test_mcp_check_loop_blocks_repeat_at_higher_depth():
    import json

    rg = RateGuard(preset="dev")
    args = {"system_prompt": "agent", "user_input": "book flight", "sequence_depth": 1}
    first = json.loads(rg.mcp_call("check_loop", args).content[0]["text"])
    assert first["allowed"] is True

    second = json.loads(
        rg.mcp_call("check_loop", {**args, "sequence_depth": 4}).content[0]["text"]
    )
    assert second["allowed"] is False
    assert "loop detected" in second["reason"]


def test_mcp_list_limits_aggregates_state():
    import json

    rg = RateGuard(preset="dev")
    result = json.loads(rg.mcp_call("list_limits", {"key": "agent-1"}).content[0]["text"])
    assert "rate_limit" in result
    assert "circuit_breaker" in result
    assert "preset" in result
    assert "loop_detector" in result


def test_mcp_unknown_tool_raises():
    rg = RateGuard(preset="dev")
    try:
        rg.mcp_call("nonexistent")
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "available:" in str(exc)


def test_loop_detector_enforces_max_depth():
    detector = LoopDetector(max_depth=5)
    allowed, reason = detector.check("a" * 64, 9)
    assert allowed is False
    assert "max sequence depth" in reason
