"""
MCP stdio server — zero-dependency JSON-RPC 2.0 transport.

Port of packages/sdk-go/mcp_server.go: newline-delimited JSON-RPC 2.0
messages on stdin/stdout, stdlib only. Any MCP client (Claude Code, Claude
Desktop, Cursor, custom agents) can connect RateGuard as a tool server:

    {"mcpServers": {"rateguard": {"command": "your-app", "args": ["mcp"]}}}

and in your app:

    from rateguard import RateGuard, serve_mcp
    serve_mcp(RateGuard(preset="mcp-server"))

Spec: https://modelcontextprotocol.io/specification/2025-06-18
Methods implemented: initialize, notifications/initialized,
notifications/cancelled, ping, tools/list, tools/call. Unknown
NON-notification methods return -32601 (method not found); notifications
(id-less messages) never get responses, known or unknown. Tool-level
failures are reported IN-BAND per the MCP spec ({"isError": true}), not as
JSON-RPC protocol errors.

The tool set and dispatch are the facade's existing mcp_tools()/mcp_call()
(see core/mcp.py) — this module is transport only, so the stdio server
shares the exact runtime, loop-detector, and guardrail-log state the
middleware admission path mutates.
"""

from __future__ import annotations

import json
import sys
from typing import IO, TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..facade import RateGuard

MCP_PROTOCOL_VERSION = "2025-06-18"
MCP_SERVER_NAME = "rateguard"

JSONRPC_PARSE_ERROR = -32700
JSONRPC_INVALID_REQUEST = -32600
JSONRPC_METHOD_NOT_FOUND = -32601
JSONRPC_INVALID_PARAMS = -32602


def _response(request_id: Any, *, result: Any = None, error: dict[str, Any] | None = None) -> dict[str, Any]:
    message: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id}
    if error is not None:
        message["error"] = error
    else:
        message["result"] = result
    return message


def _error(code: int, message: str) -> dict[str, Any]:
    return {"code": code, "message": message}


def handle_mcp_request(guard: "RateGuard", request: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    """Dispatch one JSON-RPC message. Returns (response, respond) — respond
    is False for notifications (no id), which must not produce a response.
    Mirrors Go's SDK.handleMCPRequest."""
    is_notification = "id" not in request
    request_id = request.get("id")
    method = request.get("method")

    if method == "initialize":
        from .. import __version__

        return _response(
            request_id,
            result={
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": MCP_SERVER_NAME, "version": __version__},
            },
        ), not is_notification

    if method in ("notifications/initialized", "notifications/cancelled"):
        return None, False

    if method == "ping":
        return _response(request_id, result={}), not is_notification

    if method == "tools/list":
        descriptors = [
            {"name": tool.name, "description": tool.description, "inputSchema": tool.input_schema}
            for tool in guard.mcp_tools()
        ]
        return _response(request_id, result={"tools": descriptors}), not is_notification

    if method == "tools/call":
        params = request.get("params")
        name = params.get("name") if isinstance(params, dict) else None
        if not isinstance(name, str) or not name:
            return _response(
                request_id,
                error=_error(JSONRPC_INVALID_PARAMS, "tools/call requires params.name"),
            ), not is_notification

        arguments = params.get("arguments") if isinstance(params, dict) else None
        try:
            result = guard.mcp_call(name, arguments if isinstance(arguments, dict) else {})
        except Exception as exc:  # noqa: BLE001 - tool failures are in-band per MCP spec
            return _response(
                request_id,
                result={"content": [{"type": "text", "text": str(exc)}], "isError": True},
            ), not is_notification
        return _response(
            request_id,
            result={"content": result.content, "isError": False},
        ), not is_notification

    if is_notification:
        return None, False
    return _response(
        request_id,
        error=_error(JSONRPC_METHOD_NOT_FOUND, f"method not found: {method}"),
    ), True


def serve_mcp(guard: "RateGuard", stdin: IO[str] | None = None, stdout: IO[str] | None = None) -> None:
    """Run an MCP stdio server over the given text streams until stdin
    closes. Defaults to sys.stdin/sys.stdout — the process becomes an MCP
    tool server for the given RateGuard instance. Mirrors Go's SDK.ServeMCP."""
    reader = stdin if stdin is not None else sys.stdin
    writer = stdout if stdout is not None else sys.stdout

    def write(message: dict[str, Any]) -> None:
        writer.write(json.dumps(message) + "\n")
        flush = getattr(writer, "flush", None)
        if callable(flush):
            flush()

    for line in reader:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            write({"jsonrpc": "2.0", "error": _error(JSONRPC_PARSE_ERROR, "parse error")})
            continue
        if not isinstance(request, dict):
            write({"jsonrpc": "2.0", "error": _error(JSONRPC_INVALID_REQUEST, "invalid request")})
            continue

        response, respond = handle_mcp_request(guard, request)
        if respond and response is not None:
            write(response)
