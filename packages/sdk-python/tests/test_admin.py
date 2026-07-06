"""
Admin ASGI control-plane tests — mirror of packages/sdk-go/admin.go's
routes, driven in-process via httpx.ASGITransport (same style as
tests/test_wiring.py).
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from rateguard import AdminApp, RateGuard
from rateguard.types import RateLimitOptions, RequestContext


def _guard(**kwargs: object) -> RateGuard:
    return RateGuard(preset="dev", **kwargs)  # type: ignore[arg-type]


def _client(guard: RateGuard) -> AsyncClient:
    app = guard.admin_asgi_app
    assert isinstance(app, AdminApp)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://admin")


def _request(path: str = "/api") -> RequestContext:
    return RequestContext("GET", path, {}, "req-1", "trace-1", "tenant", "route", "up")


@pytest.mark.asyncio
async def test_admin_state_returns_list_limits_shape() -> None:
    guard = _guard()
    async with _client(guard) as client:
        response = await client.get("/admin/state", params={"key": "agent-1"})

    assert response.status_code == 200
    body = response.json()
    # Same shape the list_limits MCP tool returns — unwrapped, no MCP
    # text-envelope.
    assert body["key"] == "agent-1"
    assert set(body) == {"key", "rate_limit", "token_budget", "circuit_breaker", "preset", "loop_detector", "guardrails"}
    assert body["rate_limit"]["allowed"] is True
    assert body["circuit_breaker"]["state"] == "closed"
    assert body["preset"]["name"] == "dev"


@pytest.mark.asyncio
async def test_admin_state_defaults_key_and_never_consumes() -> None:
    guard = _guard()
    async with _client(guard) as client:
        first = await client.get("/admin/state")
        second = await client.get("/admin/state")

    assert first.json()["key"] == "default"
    # Peek semantics: repeated state reads report identical remaining.
    assert first.json()["rate_limit"]["remaining"] == second.json()["rate_limit"]["remaining"]


@pytest.mark.asyncio
async def test_admin_policy_get_patch_roundtrip_affects_admission() -> None:
    guard = _guard(rate_limit=RateLimitOptions(requests_per_second=100, burst=100))
    async with _client(guard) as client:
        before = await client.get("/admin/policy")
        assert before.status_code == 200
        assert before.json()["requests_per_second"] == 100
        assert before.json()["burst"] == 100

        patched = await client.patch(
            "/admin/policy",
            json={"requests_per_second": 1, "burst": 1, "token_budget_per_hour": 123, "token_budget_mode": "soft-stop"},
        )
        assert patched.status_code == 200
        updated = patched.json()
        assert updated["requests_per_second"] == 1
        assert updated["burst"] == 1
        assert updated["token_budget_per_hour"] == 123
        assert updated["token_budget_mode"] == "soft-stop"
        # Untouched fields survive the partial patch.
        assert updated["name"] == "dev"

        after = await client.get("/admin/policy")
        assert after.json() == updated

    # The patch must be live wiring, not a decorative dict: with the limit
    # now 1 rps / 1 burst, the second real admission is denied.
    first = guard.runtime.admit(_request())
    second = guard.runtime.admit(_request())
    assert first.allowed
    assert not second.allowed
    assert second.status_code == 429


@pytest.mark.asyncio
async def test_admin_policy_rejects_bad_json_and_bad_types() -> None:
    guard = _guard()
    async with _client(guard) as client:
        malformed = await client.patch("/admin/policy", content=b"{not json", headers={"content-type": "application/json"})
        assert malformed.status_code == 400
        assert "invalid JSON body" in malformed.json()["error"]

        wrong_shape = await client.patch("/admin/policy", json=[1, 2, 3])
        assert wrong_shape.status_code == 400

        bad_type = await client.patch("/admin/policy", json={"requests_per_second": "fast"})
        assert bad_type.status_code == 400
        assert "invalid policy patch" in bad_type.json()["error"]


@pytest.mark.asyncio
async def test_admin_mcp_tools_catalog_without_handlers() -> None:
    guard = _guard()
    async with _client(guard) as client:
        response = await client.get("/admin/mcp/tools")

    assert response.status_code == 200
    catalog = response.json()
    assert [tool["name"] for tool in catalog] == [tool.name for tool in guard.mcp_tools()]
    for tool in catalog:
        # Handler functions must not leak into JSON — exactly these keys.
        assert set(tool) == {"name", "description", "input_schema"}
        assert tool["input_schema"]["type"] == "object"


@pytest.mark.asyncio
async def test_admin_mcp_call_returns_unwrapped_result() -> None:
    guard = _guard()
    async with _client(guard) as client:
        response = await client.post(
            "/admin/mcp/call",
            json={"tool": "get_rate_limit_state", "args": {"key": "agent-1"}},
        )

    assert response.status_code == 200
    body = response.json()
    # Raw handler result — a dict, not MCP's {"content":[{"type":"text",...}]}.
    assert body["key"] == "agent-1"
    assert body["allowed"] is True
    assert "content" not in body


@pytest.mark.asyncio
async def test_admin_mcp_call_unknown_tool_is_404() -> None:
    guard = _guard()
    async with _client(guard) as client:
        response = await client.post("/admin/mcp/call", json={"tool": "nope", "args": {}})

    assert response.status_code == 404
    assert response.json() == {"error": 'unknown tool "nope"'}


@pytest.mark.asyncio
async def test_admin_mcp_call_handler_error_is_400() -> None:
    guard = _guard()
    async with _client(guard) as client:
        # get_rate_limit_state without its required key raises in-handler.
        response = await client.post("/admin/mcp/call", json={"tool": "get_rate_limit_state", "args": {}})

    assert response.status_code == 400
    assert "key is required" in response.json()["error"]


@pytest.mark.asyncio
async def test_admin_mcp_call_requires_tool_field() -> None:
    guard = _guard()
    async with _client(guard) as client:
        response = await client.post("/admin/mcp/call", json={"args": {}})

    assert response.status_code == 400
    assert response.json() == {"error": '"tool" is required'}


@pytest.mark.asyncio
async def test_admin_cors_preflight_and_headers_on_every_response() -> None:
    guard = _guard()
    async with _client(guard) as client:
        preflight = await client.options("/admin/policy")
        assert preflight.status_code == 204
        assert preflight.content == b""

        ok = await client.get("/admin/policy")
        missing = await client.get("/admin/nope")

    for response in (preflight, ok, missing):
        assert response.headers["access-control-allow-origin"] == "*"
        assert response.headers["access-control-allow-methods"] == "GET, PATCH, POST, OPTIONS"
        assert response.headers["access-control-allow-headers"] == "Content-Type"
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_admin_wrong_methods_are_405() -> None:
    guard = _guard()
    async with _client(guard) as client:
        state = await client.post("/admin/state")
        policy = await client.delete("/admin/policy")
        tools = await client.post("/admin/mcp/tools")
        call = await client.get("/admin/mcp/call")

    assert state.status_code == 405 and state.json()["error"] == "GET only"
    assert policy.status_code == 405 and policy.json()["error"] == "GET or PATCH only"
    assert tools.status_code == 405 and tools.json()["error"] == "GET only"
    assert call.status_code == 405 and call.json()["error"] == "POST only"
