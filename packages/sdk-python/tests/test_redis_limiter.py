"""
Redis distributed GCRA limiter tests.

Two layers, deliberately separate:

1. Mocked-client contract tests (always run). These prove the CALLING
   CONTRACT — that RedisGCRALimiter submits the exact Lua script text, in
   the exact ARGV order (interval_us, burst, now_us, ttl_ms[, n]), and maps
   the 4-element result array onto RateLimitDecision the same way Go does.
   They do NOT prove the Lua math itself — a mock returns whatever we tell
   it to. Go owns that proof (packages/sdk-go/redis_limiter_test.go) with
   the byte-identical script, and the expected request/response pairs used
   below are copied from that file's fakes so both SDKs assert against the
   same source of truth rather than inventing their own.

2. Real-Redis integration tests (skipped when localhost:6379 is down).
   These exercise the actual Lua scripts inside a live Redis. The clock is
   injected (the scripts take now_us as ARGV — Redis's own clock is only
   used for key TTL), so admission decisions are fully deterministic and
   the expected remaining/retry_after_ms values are hand-derived from the
   GCRA recurrence the script implements.
"""

from __future__ import annotations

import socket
import uuid
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from rateguard import RateGuard
from rateguard.core.rate_limiter import RateLimiter
from rateguard.core.redis_limiter import (
    LUA_REDIS_GCRA_INCREMENT_SCRIPT,
    LUA_REDIS_GCRA_PEEK_SCRIPT,
    LUA_REDIS_GCRA_RATE_LIMIT_SCRIPT,
    LUA_REDIS_GCRA_RESET_SCRIPT,
    AsyncRedisPyClient,
    RedisGCRALimiter,
    RedisPyClient,
    build_redis_gcra_tier,
)
from rateguard.types import RateLimitOptions, RequestContext

from .helpers import FixedClock


def _request(path: str = "/api") -> RequestContext:
    return RequestContext("GET", path, {}, "req-1", "trace-1", "tenant", "route", "up")


# ── build_redis_gcra_tier: exact ceiling-division parity with Go ──


def test_build_redis_gcra_tier_matches_go_rounding() -> None:
    # (rps, burst) -> (interval_us, burst64, ttl_ms), hand-checked against
    # Go's buildRedisGCRATier (truncating division + bump on remainder).
    assert build_redis_gcra_tier(1, 1) == (1_000_000, 1, 1_000)
    assert build_redis_gcra_tier(10, 20) == (100_000, 20, 2_000)
    assert build_redis_gcra_tier(1_000, 2_000) == (1_000, 2_000, 2_000)
    # 1_000_000 / 3 = 333_333.33… -> ceil to 333_334; 333_334 * 7 = 2_333_338 us
    # -> ceil(2_333.338) ms = 2_334.
    assert build_redis_gcra_tier(3, 7) == (333_334, 7, 2_334)
    # Sub-microsecond interval floors at 1; ttl floors at 1.
    assert build_redis_gcra_tier(2_000_000, 1) == (1, 1, 1)
    assert build_redis_gcra_tier(0, 5) == (0, 0, 0)
    assert build_redis_gcra_tier(5, 0) == (0, 0, 0)


# ── Mocked clients (shapes copied from Go's redis_limiter_test.go) ──


class RecordingClient:
    """Mirror of Go's recordingRedisLimiterClient: captures the script and
    args of the last eval call and returns a fixed GCRA-shaped response."""

    def __init__(self, response: list[int]) -> None:
        self.response = response
        self.last_script: str | None = None
        self.last_keys: list[str] | None = None
        self.last_args: tuple[Any, ...] | None = None

    def eval(self, script: str, keys: list[str], *args: Any) -> Any:
        self.last_script = script
        self.last_keys = keys
        self.last_args = args
        return self.response


class SequencedClient:
    """Mirror of Go's fakeRedisLimiterClient: first eval allows, every
    subsequent eval denies with retry_after_ms=1."""

    def __init__(self) -> None:
        self.calls = 0
        self.last_now_us: int | None = None

    def eval(self, script: str, keys: list[str], *args: Any) -> Any:
        if len(args) >= 3:
            self.last_now_us = int(args[2])
        self.calls += 1
        if self.calls == 1:
            return [1, 0, 0, 0]
        return [0, 0, 1, 1]


class FailingClient:
    def eval(self, script: str, keys: list[str], *args: Any) -> Any:
        raise ConnectionError("redis unavailable")


# ── Contract: script text, ARGV order, result mapping ──


def test_allow_dispatches_rate_limit_script_with_go_argv_order() -> None:
    client = RecordingClient(response=[1, 0, 0, 0])
    clock = FixedClock(1_700_000_000_000.0)  # epoch ms
    limiter = RedisGCRALimiter(client, clock)
    options = RateLimitOptions(requests_per_second=10, burst=20)

    decision = limiter.allow("tenant-a", options)

    assert client.last_script == LUA_REDIS_GCRA_RATE_LIMIT_SCRIPT
    assert client.last_keys == ["tenant-a"]
    # ARGV order is Go's: interval_us, burst, now_us, ttl_ms.
    assert client.last_args == (100_000, 20, 1_700_000_000_000_000, 2_000)
    assert decision.allowed and decision.applied
    assert decision.limit == 10


def test_allow_uses_injected_clock_for_now_us() -> None:
    # Mirror of Go's TestRedisLimiterUsesInjectedClock: now_us must be the
    # injected clock's epoch microseconds, never wall clock.
    client = SequencedClient()
    clock = FixedClock(123_456.0)  # ms
    limiter = RedisGCRALimiter(client, clock)
    limiter.allow("tenant-a", RateLimitOptions(requests_per_second=1, burst=1))
    assert client.last_now_us == 123_456_000


def test_allow_maps_denied_result_like_go() -> None:
    # Go's fake returns {0,0,1,1} on the second call: denied, remaining
    # forced to 0, retry_after 1ms.
    client = SequencedClient()
    limiter = RedisGCRALimiter(client, FixedClock(0.0))
    options = RateLimitOptions(requests_per_second=1, burst=1)

    first = limiter.allow("k", options)
    second = limiter.allow("k", options)

    assert first.allowed and first.applied
    assert not second.allowed and second.applied
    assert second.remaining == 0
    assert second.retry_after_ms == 1


def test_increment_sends_n_as_fifth_arg() -> None:
    # Mirror of Go's TestRedisStoreIncrementSendsN, same fixture values:
    # rps=10, burst=20, n=5, scripted response {1,7,0,0}.
    client = RecordingClient(response=[1, 7, 0, 0])
    limiter = RedisGCRALimiter(client, FixedClock(1_700_000_000_000.0))
    options = RateLimitOptions(requests_per_second=10, burst=20)

    decision = limiter.increment("tenant-a", options, 5)

    assert client.last_script == LUA_REDIS_GCRA_INCREMENT_SCRIPT
    assert client.last_args is not None and len(client.last_args) == 5
    assert client.last_args[4] == 5
    assert decision.allowed and decision.remaining == 7


def test_get_delegates_to_peek_script_never_the_mutating_one() -> None:
    # Mirror of Go's TestRedisStoreGetDelegatesToPeek: response {1,12,0,0}
    # under rps=10/burst=20 -> tokens=12 capacity=20 limit=10.
    client = RecordingClient(response=[1, 12, 0, 0])
    limiter = RedisGCRALimiter(client, FixedClock(1_700_000_000_000.0))
    options = RateLimitOptions(requests_per_second=10, burst=20)

    state = limiter.get("tenant-a", options)

    assert client.last_script == LUA_REDIS_GCRA_PEEK_SCRIPT
    assert state.tokens == 12.0
    assert state.capacity == 20
    assert state.limit == 10


def test_reset_sends_del_script_with_key() -> None:
    # Mirror of Go's TestRedisStoreResetSendsDelScript.
    client = RecordingClient(response=[])
    limiter = RedisGCRALimiter(client, FixedClock(0.0))

    limiter.reset("tenant-a")

    assert client.last_script == LUA_REDIS_GCRA_RESET_SCRIPT
    assert client.last_keys == ["tenant-a"]


def test_unlimited_policy_short_circuits_without_calling_redis() -> None:
    client = RecordingClient(response=[1, 0, 0, 0])
    limiter = RedisGCRALimiter(client, FixedClock(0.0))

    decision = limiter.allow("k", RateLimitOptions(requests_per_second=0, burst=0))

    assert decision.allowed and not decision.applied
    assert client.last_script is None  # Redis never touched


@pytest.mark.asyncio
async def test_async_path_uses_async_client_and_same_contract() -> None:
    calls: list[tuple[str, tuple[Any, ...]]] = []

    class AsyncFake:
        async def eval(self, script: str, keys: list[str], *args: Any) -> Any:
            calls.append((script, args))
            return [1, 3, 0, 0]

    limiter = RedisGCRALimiter(None, FixedClock(50.0), async_client=AsyncFake())
    options = RateLimitOptions(requests_per_second=10, burst=20)

    decision = await limiter.allow_async("k", options)

    assert decision.allowed and decision.remaining == 3
    script, args = calls[0]
    assert script == LUA_REDIS_GCRA_RATE_LIMIT_SCRIPT
    assert args == (100_000, 20, 50_000, 2_000)


# ── Runtime wiring: redis_client swaps the limiter backend ──


def test_rateguard_with_redis_client_uses_redis_limiter() -> None:
    guard = RateGuard(
        preset="dev",
        rate_limit=RateLimitOptions(requests_per_second=1, burst=1),
        redis_client=SequencedClient(),
    )
    assert isinstance(guard.runtime.rate_limiter, RedisGCRALimiter)


def test_rateguard_without_redis_client_keeps_in_memory_limiter() -> None:
    guard = RateGuard(preset="dev", rate_limit=RateLimitOptions(requests_per_second=1, burst=1))
    assert isinstance(guard.runtime.rate_limiter, RateLimiter)


def test_runtime_admit_routes_through_redis_limiter() -> None:
    # Mirror of Go's TestHTTPMiddlewareUsesRedisLimiterForRepeatRequests:
    # the fake allows the first eval and denies every one after.
    client = SequencedClient()
    guard = RateGuard(
        preset="dev",
        rate_limit=RateLimitOptions(requests_per_second=1, burst=1),
        redis_client=client,
    )

    first = guard.runtime.admit(_request())
    second = guard.runtime.admit(_request())

    assert first.allowed
    assert not second.allowed
    assert second.status_code == 429
    assert second.error_code == "rate_limit_exceeded"
    assert client.calls == 2  # both admissions actually hit "Redis"


def test_runtime_fails_closed_when_redis_errors() -> None:
    # Mirror of Go's TestHTTPMiddlewareFailsClosedWhenRedisLimiterErrors:
    # an unreachable Redis must NOT silently admit unlimited traffic.
    guard = RateGuard(
        preset="dev",
        rate_limit=RateLimitOptions(requests_per_second=100, burst=100),
        redis_client=FailingClient(),
    )

    decision = guard.runtime.admit(_request())

    assert not decision.allowed
    assert decision.status_code == 503
    assert decision.error_code == "rate_limit_unavailable"


@pytest.mark.asyncio
async def test_asgi_middleware_end_to_end_with_redis_client() -> None:
    guard = RateGuard(
        preset="dev",
        rate_limit=RateLimitOptions(requests_per_second=1, burst=1),
        redis_client=SequencedClient(),
    )
    app = FastAPI()
    app.add_middleware(guard.asgi_middleware)
    calls = 0

    @app.get("/hello")
    async def hello() -> dict[str, bool]:
        nonlocal calls
        calls += 1
        return {"ok": True}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.get("/hello")
        second = await client.get("/hello")

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers.get("retry-after") is not None
    assert calls == 1


# ── Real-Redis integration (auto-skipped when Redis is down) ──


def _redis_reachable() -> bool:
    sock = socket.socket()
    sock.settimeout(0.25)
    try:
        sock.connect(("localhost", 6379))
        return True
    except OSError:
        return False
    finally:
        sock.close()


REDIS_UP = _redis_reachable()
requires_redis = pytest.mark.skipif(not REDIS_UP, reason="no Redis server on localhost:6379")

# All integration keys are namespaced and unique per test run so parallel
# runs / leftover state can't interfere; TTLs expire them regardless.


def _key() -> str:
    return f"rateguard:test:{uuid.uuid4().hex}"


@pytest.fixture()
def sync_limiter() -> Any:
    redis = pytest.importorskip("redis")
    raw = redis.Redis(host="localhost", port=6379)
    limiter = RedisGCRALimiter(RedisPyClient(raw), FixedClock(1_700_000_000_000.0))
    yield limiter
    raw.close()


@requires_redis
def test_redis_integration_allows_burst_then_denies_with_exact_retry(sync_limiter: RedisGCRALimiter) -> None:
    # rps=1, burst=2, fixed clock. GCRA recurrence (interval = 1s):
    #   call 1: tat=now        -> allowed, remaining 1
    #   call 2: tat=now+1s     -> allowed, remaining 0
    #   call 3: tat=now+2s, allow_at=now+1s > now -> denied, retry 1000ms
    key = _key()
    options = RateLimitOptions(requests_per_second=1, burst=2)

    first = sync_limiter.allow(key, options)
    second = sync_limiter.allow(key, options)
    third = sync_limiter.allow(key, options)

    assert (first.allowed, first.remaining) == (True, 1)
    assert (second.allowed, second.remaining) == (True, 0)
    assert not third.allowed
    assert third.remaining == 0
    assert third.retry_after_ms == 1_000
    assert third.limit == 1


@requires_redis
def test_redis_integration_peek_never_consumes(sync_limiter: RedisGCRALimiter) -> None:
    key = _key()
    options = RateLimitOptions(requests_per_second=1, burst=2)

    for _ in range(3):
        peeked = sync_limiter.peek(key, options)
        assert peeked.allowed and peeked.remaining == 1

    # Full burst still available after all those peeks.
    assert sync_limiter.allow(key, options).allowed
    assert sync_limiter.allow(key, options).allowed


@requires_redis
def test_redis_integration_increment_consumes_n_cells(sync_limiter: RedisGCRALimiter) -> None:
    key = _key()
    options = RateLimitOptions(requests_per_second=10, burst=20)

    # interval=100ms. n=5: newTat=now+500ms, remaining=floor((2s-0.5s)/0.1s)=15.
    first = sync_limiter.increment(key, options, 5)
    assert first.allowed and first.remaining == 15

    # n=20 with tat=now+500ms: tolerance=0, allow_at=now+500ms>now -> denied.
    # A 500ms deficit ceils to the nearest WHOLE SECOND (AGENTS.md rule 13
    # — matches the in-memory limiter's rounding, not raw millisecond
    # ceiling), so retry_after_ms is 1000, not 500.
    second = sync_limiter.increment(key, options, 20)
    assert not second.allowed
    assert second.retry_after_ms == 1_000


@requires_redis
def test_redis_integration_reset_restores_full_bucket(sync_limiter: RedisGCRALimiter) -> None:
    key = _key()
    options = RateLimitOptions(requests_per_second=1, burst=1)

    assert sync_limiter.allow(key, options).allowed
    assert not sync_limiter.allow(key, options).allowed

    sync_limiter.reset(key)
    assert sync_limiter.allow(key, options).allowed


@requires_redis
def test_redis_integration_get_reports_bucket_state(sync_limiter: RedisGCRALimiter) -> None:
    key = _key()
    options = RateLimitOptions(requests_per_second=10, burst=20)

    # Fresh key: would-be tat = now+100ms -> remaining floor((2s-0.1s)/0.1s)=19.
    state = sync_limiter.get(key, options)
    assert state.tokens == 19.0
    assert state.capacity == 20
    assert state.limit == 10


@requires_redis
@pytest.mark.asyncio
async def test_redis_integration_async_client_allow_and_deny() -> None:
    redis_asyncio = pytest.importorskip("redis.asyncio")
    raw = redis_asyncio.Redis(host="localhost", port=6379)
    limiter = RedisGCRALimiter(None, FixedClock(1_700_000_000_000.0), async_client=AsyncRedisPyClient(raw))
    options = RateLimitOptions(requests_per_second=1, burst=1)
    key = _key()
    try:
        first = await limiter.allow_async(key, options)
        second = await limiter.allow_async(key, options)
        assert first.allowed
        assert not second.allowed
        assert second.retry_after_ms == 1_000
        await limiter.reset_async(key)
        third = await limiter.allow_async(key, options)
        assert third.allowed
    finally:
        await raw.aclose()
