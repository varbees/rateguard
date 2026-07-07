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


# ── MCP tools (parity with Go's mcp.go: 7 tools) ──

from rateguard import RateGuard, create_mcp_tools, mcp_call


def test_mcp_tools_expose_all_seven_tools_matching_go():
    rg = RateGuard(preset="dev")
    names = sorted(tool.name for tool in rg.mcp_tools())
    assert names == [
        "attest_budget",
        "check_loop",
        "get_circuit_breaker_state",
        "get_rate_limit_state",
        "get_token_budget",
        "list_limits",
        "verify_budget",
    ]


def test_mcp_attest_budget_mints_root_token_verify_budget_validates_end_to_end():
    import json

    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from rateguard import private_key_to_raw
    from rateguard.core.budget_attestation import _private_public_bytes

    rg = RateGuard(preset="dev")
    authority = Ed25519PrivateKey.generate()

    minted = json.loads(
        rg.mcp_call(
            "attest_budget",
            {
                "signing_key": base64_encode(private_key_to_raw(authority)),
                "max_tokens": 10_000,
                "providers": ["openai"],
                "max_depth": 1,
                "expires_in_seconds": 3_600,
            },
        ).content[0]["text"]
    )
    assert minted["token"]
    assert minted["delegate_private_key"]

    verified = json.loads(
        rg.mcp_call(
            "verify_budget",
            {
                "token": minted["token"],
                "root_public_key": base64_encode(_private_public_bytes(authority)),
            },
        ).content[0]["text"]
    )
    assert verified["valid"] is True
    assert verified["proof_of_possession_verified"] is False
    assert verified["effective_grant"]["max_tokens"] == 10_000
    assert verified["effective_grant"]["providers"] == ["openai"]


def test_mcp_verify_budget_rejects_wrong_root_key():
    import json

    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from rateguard import private_key_to_raw
    from rateguard.core.budget_attestation import _private_public_bytes

    rg = RateGuard(preset="dev")
    authority = Ed25519PrivateKey.generate()
    impostor = Ed25519PrivateKey.generate()

    minted = json.loads(
        rg.mcp_call(
            "attest_budget",
            {
                "signing_key": base64_encode(private_key_to_raw(authority)),
                "max_tokens": 1_000,
                "max_depth": 0,
                "expires_in_seconds": 3_600,
            },
        ).content[0]["text"]
    )

    verified = json.loads(
        rg.mcp_call(
            "verify_budget",
            {"token": minted["token"], "root_public_key": base64_encode(_private_public_bytes(impostor))},
        ).content[0]["text"]
    )
    assert verified["valid"] is False
    assert verified.get("error")


def base64_encode(raw: bytes) -> str:
    import base64

    return base64.b64encode(raw).decode("ascii")


def test_mcp_get_rate_limit_state_does_not_consume():
    import json

    rg = RateGuard(preset="dev")
    first = json.loads(rg.mcp_call("get_rate_limit_state", {"key": "agent-1"}).content[0]["text"])
    second = json.loads(rg.mcp_call("get_rate_limit_state", {"key": "agent-1"}).content[0]["text"])
    assert first["remaining"] == second["remaining"]


def test_mcp_check_loop_blocks_repeat_at_higher_depth():
    import json

    rg = RateGuard(preset="dev")
    args = {"system_prompt": "agent", "user_input": "book flight", "sequence_depth": 1, "record": True}
    first = json.loads(rg.mcp_call("check_loop", args).content[0]["text"])
    assert first["allowed"] is True

    second = json.loads(
        rg.mcp_call("check_loop", {**args, "sequence_depth": 4}).content[0]["text"]
    )
    assert second["allowed"] is False
    assert "loop detected" in second["reason"]


def test_mcp_check_loop_defaults_to_peek_not_record():
    """Reproduces a real gap: the tool's own description says "Does not
    record the fingerprint unless 'record' is true," but the handler
    defaulted 'record' to True when the field was omitted — a caller
    trusting the tool's own docs and calling it as a bare pre-flight check
    was silently mutating loop-detector state on every call (AGENTS.md
    rule 5: pre-flight queries must never consume/record)."""
    import json

    rg = RateGuard(preset="dev")
    args = {"system_prompt": "agent", "user_input": "book flight", "sequence_depth": 1}
    rg.mcp_call("check_loop", args)  # 'record' deliberately omitted

    # Same fingerprint at a deeper sequence depth: if the first call had
    # been recorded (the bug), this trips "loop detected". It must still
    # report allowed — nothing exists yet for this fingerprint to compare
    # against.
    second = json.loads(
        rg.mcp_call("check_loop", {**args, "sequence_depth": 4}).content[0]["text"]
    )
    assert second["allowed"] is True


def test_mcp_list_limits_aggregates_state():
    import json

    rg = RateGuard(preset="dev")
    result = json.loads(rg.mcp_call("list_limits", {"key": "agent-1"}).content[0]["text"])
    assert "rate_limit" in result
    assert "circuit_breaker" in result
    assert "preset" in result
    assert "loop_detector" in result


def test_mcp_list_limits_preset_matches_go_shape():
    """Reproduces a real cross-language gap: list_limits's inline "preset"
    object only carried name/requests_per_second/burst — missing all 4
    token-budget fields Go's mcpListLimits includes. An agent calling
    list_limits for initialization (the tool's documented purpose) got an
    incomplete picture of its own token budget in Python (and Node, fixed
    identically) while Go's response was complete."""
    import json

    rg = RateGuard(preset="dev")
    result = json.loads(rg.mcp_call("list_limits", {"key": "agent-1"}).content[0]["text"])
    preset = result["preset"]
    for field in (
        "name",
        "requests_per_second",
        "burst",
        "token_budget_per_hour",
        "token_budget_per_day",
        "token_budget_per_month",
        "token_budget_mode",
    ):
        assert field in preset, f"list_limits preset missing {field!r}, want parity with Go's mcpListLimits"


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
