"""
Admin control-plane API — raw ASGI, zero dependencies.

Port of packages/sdk-go/admin.go: a small read/write control-plane API for
the RateGuard dashboard (packages/dashboard) or any operator tooling.

    GET   /admin/state?key=<key>   full snapshot for key — rate limit,
                                   token budget, circuit breaker, loop
                                   detector stats (same data as the
                                   list_limits MCP tool)
    GET   /admin/policy            current effective policy
    PATCH /admin/policy            partial policy override, applied via
                                   the runtime's set_policy — in-memory
                                   only, does not persist across restarts
    GET   /admin/mcp/tools         the MCP tool catalog (name, description,
                                   JSON Schema) — no handler funcs, safe
                                   to serialize
    POST  /admin/mcp/call          {"tool": "...", "args": {...}} — invokes
                                   the named MCP tool's raw handler
                                   directly (same one mcp_call dispatches
                                   to) and returns its result unwrapped,
                                   for a UI to render directly instead of
                                   parsing MCP's text-envelope transport
                                   shape
    POST  /admin/freeze            {"scope": ""} — kill switch: halt outbound
                                   LLM calls for a scope (empty = everything,
                                   else a customer id). Returns the frozen list.
    POST  /admin/unfreeze          {"scope": ""} — lift a freeze
    GET   /admin/frozen            the currently frozen scopes
    GET   /admin/events            recent enforcement events (budget stops,
                                   rate limits, freezes), newest first — the
                                   pull-side audit trail. ?limit=N caps the
                                   count; ?format=csv returns a CSV export
                                   instead of JSON, for finance and the record

Security posture: this app has NO authentication and is not safe to expose
on the public internet — anyone who can reach it can read your current
limits and change them. Bind it to localhost, an internal network, or put
it behind your own reverse-proxy auth: the same posture you'd give pprof
or an unauthenticated Prometheus /metrics endpoint. It is opt-in — nothing
wires it into the request-path middleware.

Usage (any ASGI server; mount standalone on an internal port, never on the
public app):

    from rateguard import RateGuard
    guard = RateGuard(preset="standard")
    admin = guard.admin_asgi_app          # e.g. uvicorn on 127.0.0.1:9090

Browser threat model: unlike pprof/metrics (read-only), this app accepts
state-mutating requests (PATCH /admin/policy, POST /admin/mcp/call).
Without cors_origin set, no cross-origin fetch from a browser can reach
it — same-origin only. Pass cors_origin (e.g. "http://localhost:3001" for
a locally-run dashboard) to allow that one origin — never "*", which
would let any webpage open in the same browser reach this unauthenticated
API via a cross-origin fetch.
"""

from __future__ import annotations

import csv
import io
import json
from typing import TYPE_CHECKING, Any, Awaitable, Callable
from urllib.parse import parse_qs

if TYPE_CHECKING:
    from ..facade import RateGuard
    from .enforcement_log import EnforcementEvent
    from .mcp import MCPTool

ASGIReceive = Callable[[], Awaitable[dict[str, Any]]]
ASGISend = Callable[[dict[str, Any]], Awaitable[None]]


def _cors_headers(cors_origin: str | None) -> list[tuple[bytes, bytes]]:
    if not cors_origin:
        return []
    return [
        (b"access-control-allow-origin", cors_origin.encode("utf-8")),
        (b"access-control-allow-methods", b"GET, PATCH, POST, OPTIONS"),
        (b"access-control-allow-headers", b"Content-Type"),
        (b"vary", b"Origin"),
    ]


class AdminApp:
    """Standalone ASGI application serving the 4 fixed admin routes for a
    RateGuard instance. Raw ASGI protocol — no framework required."""

    def __init__(self, guard: "RateGuard", cors_origin: str | None = None) -> None:
        self._guard = guard
        self._cors_origin = cors_origin

    async def __call__(self, scope: dict[str, Any], receive: ASGIReceive, send: ASGISend) -> None:
        if scope["type"] == "lifespan":
            # Support being served directly by uvicorn & co.
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope["type"] != "http":
            raise RuntimeError(f"rateguard admin: unsupported ASGI scope type {scope['type']!r}")

        method: str = scope["method"].upper()
        path: str = scope["path"]

        # Every response in this request goes through a send wrapper that
        # injects the configured CORS headers (or none) into
        # http.response.start — so the ~15 call sites below that build
        # responses never need to know about CORS at all.
        cors_headers = _cors_headers(self._cors_origin)
        send = _cors_wrapped_send(send, cors_headers)

        # CORS preflight is answered for every path, mirroring Go's
        # withAdminCORS wrapping the whole mux.
        if method == "OPTIONS":
            await _send_empty(send, 204)
            return

        if path == "/admin/state":
            await self._handle_state(scope, method, send)
        elif path == "/admin/policy":
            await self._handle_policy(method, receive, send)
        elif path == "/admin/mcp/tools":
            await self._handle_mcp_tools(method, send)
        elif path == "/admin/mcp/call":
            await self._handle_mcp_call(method, receive, send)
        elif path == "/admin/freeze":
            await self._handle_freeze(method, receive, send, freeze=True)
        elif path == "/admin/unfreeze":
            await self._handle_freeze(method, receive, send, freeze=False)
        elif path == "/admin/frozen":
            await self._handle_frozen(method, send)
        elif path == "/admin/events":
            await self._handle_events(scope, method, send)
        else:
            await _send_error(send, 404, "not found")

    # ── routes ──

    async def _handle_state(self, scope: dict[str, Any], method: str, send: ASGISend) -> None:
        if method != "GET":
            await _send_error(send, 405, "GET only")
            return

        query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
        key = (query.get("key") or ["default"])[0] or "default"

        # Calls the same raw handler behind the list_limits MCP tool
        # directly — it already returns a plain dict, so there's no need to
        # round-trip through mcp_call's JSON-in-a-string wrapping meant for
        # MCP transport. Mirrors Go's handleAdminState -> mcpListLimits.
        tool = self._find_tool("list_limits")
        try:
            result = tool.handler({"key": key})
        except Exception as exc:  # noqa: BLE001 - surfaced as a 500, mirrors Go
            await _send_error(send, 500, str(exc))
            return
        await _send_json(send, 200, result)

    async def _handle_freeze(self, method: str, receive: ASGIReceive, send: ASGISend, *, freeze: bool) -> None:
        if method != "POST":
            await _send_error(send, 405, "POST only")
            return
        body = await _read_body(receive)
        scope = ""
        if body and body.strip():
            try:
                data = json.loads(body)
            except json.JSONDecodeError as exc:
                await _send_error(send, 400, f"invalid JSON body: {exc}")
                return
            if isinstance(data, dict) and isinstance(data.get("scope"), str):
                scope = data["scope"]
        if freeze:
            self._guard.freeze(scope)
        else:
            self._guard.unfreeze(scope)
        await _send_json(send, 200, {"frozen": self._guard.frozen_scopes()})

    async def _handle_frozen(self, method: str, send: ASGISend) -> None:
        if method != "GET":
            await _send_error(send, 405, "GET only")
            return
        await _send_json(send, 200, {"frozen": self._guard.frozen_scopes()})

    async def _handle_events(self, scope: dict[str, Any], method: str, send: ASGISend) -> None:
        if method != "GET":
            await _send_error(send, 405, "GET only")
            return
        query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
        limit = 0
        raw_limit = (query.get("limit") or ["0"])[0]
        try:
            limit = int(raw_limit)
        except ValueError:
            limit = 0
        events = self._guard.enforcement_events(limit)
        if (query.get("format") or [""])[0] == "csv":
            await _send_csv(send, events)
            return
        await _send_json(
            send,
            200,
            [
                {
                    "at": e.at,
                    "type": e.type,
                    "customer": e.customer,
                    "provider": e.provider,
                    "model": e.model,
                    "detail": e.detail,
                }
                for e in events
            ],
        )

    async def _handle_policy(self, method: str, receive: ASGIReceive, send: ASGISend) -> None:
        runtime = self._guard.runtime
        if method == "GET":
            await _send_json(send, 200, runtime.get_policy())
            return
        if method != "PATCH":
            await _send_error(send, 405, "GET or PATCH only")
            return

        body = await _read_body(receive)
        try:
            patch = json.loads(body or b"null")
        except json.JSONDecodeError as exc:
            await _send_error(send, 400, f"invalid JSON body: {exc}")
            return
        if not isinstance(patch, dict):
            await _send_error(send, 400, "invalid JSON body: expected an object")
            return

        # Same wire shape as Go's adminPolicyPatch: every field optional,
        # snake_case keys — requests_per_second, burst,
        # token_budget_per_hour/day/month, token_budget_mode. Unknown keys
        # are ignored (set_policy only reads the known ones).
        try:
            updated = runtime.set_policy(patch)
        except (TypeError, ValueError) as exc:
            await _send_error(send, 400, f"invalid policy patch: {exc}")
            return
        await _send_json(send, 200, updated)

    async def _handle_mcp_tools(self, method: str, send: ASGISend) -> None:
        if method != "GET":
            await _send_error(send, 405, "GET only")
            return
        # MCPTool minus its unserializable handler func, snake_case
        # input_schema key — mirrors Go's adminMCPTool.
        catalog = [
            {"name": tool.name, "description": tool.description, "input_schema": tool.input_schema}
            for tool in self._guard.mcp_tools()
        ]
        await _send_json(send, 200, catalog)

    async def _handle_mcp_call(self, method: str, receive: ASGIReceive, send: ASGISend) -> None:
        if method != "POST":
            await _send_error(send, 405, "POST only")
            return

        body = await _read_body(receive)
        try:
            request = json.loads(body or b"null")
        except json.JSONDecodeError as exc:
            await _send_error(send, 400, f"invalid JSON body: {exc}")
            return
        if not isinstance(request, dict):
            await _send_error(send, 400, "invalid JSON body: expected an object")
            return

        tool_name = request.get("tool")
        if not isinstance(tool_name, str) or not tool_name:
            await _send_error(send, 400, '"tool" is required')
            return
        args = request.get("args")
        if not isinstance(args, dict):
            args = {}

        for tool in self._guard.mcp_tools():
            if tool.name == tool_name:
                try:
                    result = tool.handler(args)
                except Exception as exc:  # noqa: BLE001 - tool errors are the caller's 400
                    await _send_error(send, 400, str(exc))
                    return
                await _send_json(send, 200, result)
                return
        await _send_error(send, 404, f'unknown tool "{tool_name}"')

    def _find_tool(self, name: str) -> "MCPTool":
        for tool in self._guard.mcp_tools():
            if tool.name == name:
                return tool
        raise LookupError(f"rateguard admin: missing built-in MCP tool {name!r}")


# ── raw-ASGI plumbing ──


async def _read_body(receive: ASGIReceive) -> bytes:
    chunks: list[bytes] = []
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            break
        chunks.append(message.get("body", b""))
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


def _cors_wrapped_send(send: ASGISend, cors_headers: list[tuple[bytes, bytes]]) -> ASGISend:
    """Wraps an ASGI send callable so every http.response.start message
    gets the configured CORS headers appended — the ~15 response-building
    call sites below never need to know about CORS at all. A no-op
    (returns send unchanged) when cors_headers is empty."""
    if not cors_headers:
        return send

    async def wrapped(message: dict[str, Any]) -> None:
        if message["type"] == "http.response.start":
            message = {**message, "headers": [*message.get("headers", []), *cors_headers]}
        await send(message)

    return wrapped


async def _send_json(send: ASGISend, status: int, body: Any) -> None:
    payload = json.dumps(body).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": payload})


async def _send_csv(send: ASGISend, events: list["EnforcementEvent"]) -> None:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["at", "type", "customer", "provider", "model", "detail"])
    for e in events:
        writer.writerow([e.at, e.type, e.customer, e.provider, e.model, e.detail])
    payload = buf.getvalue().encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", b"text/csv; charset=utf-8"),
                (b"content-disposition", b'attachment; filename="rateguard-events.csv"'),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})


async def _send_error(send: ASGISend, status: int, message: str) -> None:
    await _send_json(send, status, {"error": message})


async def _send_empty(send: ASGISend, status: int) -> None:
    await send({"type": "http.response.start", "status": status, "headers": []})
    await send({"type": "http.response.body", "body": b""})
