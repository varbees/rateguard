"""
MCP stdio server tests — mirror of packages/sdk-go/mcp_server_test.go.

Drives the newline-delimited JSON-RPC transport through io.StringIO: the
same handshake any real MCP client (Claude Code/Desktop, Cursor) performs.
"""

from __future__ import annotations

import json
from io import StringIO

import rateguard
from rateguard import RateGuard, serve_mcp
from rateguard.core.mcp_server import (
    JSONRPC_INVALID_PARAMS,
    JSONRPC_METHOD_NOT_FOUND,
    JSONRPC_PARSE_ERROR,
    MCP_PROTOCOL_VERSION,
)


def run_mcp_session(guard: RateGuard, *requests: str) -> list[dict]:
    """Feed newline-delimited JSON-RPC requests through serve_mcp and
    return the decoded responses in order (mirrors Go's runMCPSession)."""
    stdin = StringIO("\n".join(requests) + "\n")
    stdout = StringIO()
    serve_mcp(guard, stdin=stdin, stdout=stdout)
    return [json.loads(line) for line in stdout.getvalue().splitlines() if line]


def test_handshake_and_tools_list() -> None:
    guard = RateGuard(preset="dev")

    responses = run_mcp_session(
        guard,
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
    )

    # The notification produced no response line.
    assert len(responses) == 2

    init = responses[0]
    assert init["id"] == 1
    assert init["result"]["protocolVersion"] == MCP_PROTOCOL_VERSION
    assert init["result"]["capabilities"] == {"tools": {}}
    assert init["result"]["serverInfo"] == {"name": "rateguard", "version": rateguard.__version__}

    listing = responses[1]
    assert listing["id"] == 2
    tools = listing["result"]["tools"]
    # Exactly the facade's create_mcp_tools() set, transport-shaped.
    expected_names = [tool.name for tool in guard.mcp_tools()]
    assert [t["name"] for t in tools] == expected_names
    for descriptor in tools:
        assert set(descriptor) == {"name", "description", "inputSchema"}
        assert descriptor["inputSchema"]["type"] == "object"


def test_ping_returns_empty_object() -> None:
    guard = RateGuard(preset="dev")
    responses = run_mcp_session(guard, '{"jsonrpc":"2.0","id":5,"method":"ping"}')
    assert responses == [{"jsonrpc": "2.0", "id": 5, "result": {}}]


def test_tools_call_real_tool() -> None:
    guard = RateGuard(preset="dev")

    responses = run_mcp_session(
        guard,
        '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_rate_limit_state","arguments":{"key":"agent-1"}}}',
    )

    assert len(responses) == 1
    result = responses[0]["result"]
    assert result["isError"] is False
    payload = json.loads(result["content"][0]["text"])
    assert payload["key"] == "agent-1"
    assert payload["allowed"] is True
    # Peek semantics: the query itself must not have consumed anything —
    # querying again reports the same remaining.
    again = run_mcp_session(
        guard,
        '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"get_rate_limit_state","arguments":{"key":"agent-1"}}}',
    )
    assert json.loads(again[0]["result"]["content"][0]["text"])["remaining"] == payload["remaining"]


def test_tools_call_failure_is_in_band_not_protocol_error() -> None:
    guard = RateGuard(preset="dev")

    responses = run_mcp_session(
        guard,
        # get_rate_limit_state without its required "key" raises inside the
        # tool handler — per MCP spec that is an isError result, not a
        # JSON-RPC error.
        '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_rate_limit_state","arguments":{}}}',
        # Unknown tool name is also a tool-level failure.
        '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}',
    )

    for response in responses:
        assert "error" not in response
        assert response["result"]["isError"] is True
        assert response["result"]["content"][0]["type"] == "text"
        assert response["result"]["content"][0]["text"]


def test_tools_call_missing_name_is_invalid_params() -> None:
    guard = RateGuard(preset="dev")
    responses = run_mcp_session(
        guard,
        '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"arguments":{"key":"k"}}}',
    )
    assert responses[0]["error"]["code"] == JSONRPC_INVALID_PARAMS


def test_unknown_method_returns_method_not_found() -> None:
    guard = RateGuard(preset="dev")
    responses = run_mcp_session(guard, '{"jsonrpc":"2.0","id":3,"method":"resources/list"}')
    assert responses[0]["error"]["code"] == JSONRPC_METHOD_NOT_FOUND
    assert "resources/list" in responses[0]["error"]["message"]


def test_unknown_notification_produces_no_response() -> None:
    # id-less messages never get responses, even for unknown methods.
    guard = RateGuard(preset="dev")
    responses = run_mcp_session(
        guard,
        '{"jsonrpc":"2.0","method":"notifications/whatever"}',
        '{"jsonrpc":"2.0","method":"notifications/cancelled"}',
        '{"jsonrpc":"2.0","id":4,"method":"ping"}',
    )
    assert len(responses) == 1
    assert responses[0]["id"] == 4


def test_malformed_line_returns_parse_error_and_keeps_serving() -> None:
    guard = RateGuard(preset="dev")
    responses = run_mcp_session(
        guard,
        "this is not json{{{",
        '{"jsonrpc":"2.0","id":12,"method":"ping"}',
    )
    assert len(responses) == 2
    assert responses[0]["error"]["code"] == JSONRPC_PARSE_ERROR
    assert "id" not in responses[0]  # nothing to echo, mirrors Go's omitempty
    assert responses[1] == {"jsonrpc": "2.0", "id": 12, "result": {}}


def test_blank_lines_are_skipped() -> None:
    guard = RateGuard(preset="dev")
    stdin = StringIO('\n\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n\n')
    stdout = StringIO()
    serve_mcp(guard, stdin=stdin, stdout=stdout)
    lines = [line for line in stdout.getvalue().splitlines() if line]
    assert len(lines) == 1
