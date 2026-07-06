"""
Redis-backed distributed GCRA rate limiter.

The actual admission math lives entirely INSIDE the 4 Lua scripts below,
copied byte-for-byte from packages/sdk-go/redis_limiter.go. Lua running
inside Redis is language-agnostic: whichever SDK (Go/Node/Python) submits
these exact scripts to the same Redis key gets identical admission
decisions, because it's literally the same code executing server-side —
not a Python re-derivation of the GCRA formula. Do NOT "improve" or
re-express this math in Python; the whole point of a distributed limiter
is behavioral parity by construction, not by keeping two implementations
in sync by hand.

GCRA source: https://en.wikipedia.org/wiki/Generic_cell_rate_algorithm

This module has ZERO hard runtime dependencies — it never imports a
concrete Redis client library (see pyproject.toml's `dependencies = []`,
kept empty on purpose). Bring your own already-constructed `redis.Redis`
or `redis.asyncio.Redis` instance (or anything else with a compatible
`.eval(...)` method) and either pass it directly (if it already matches
the `RedisLimiterClient`/`AsyncRedisLimiterClient` Protocol below) or wrap
it with `RedisPyClient`/`AsyncRedisPyClient`, the small adapters over
redis-py's native `.eval(script, numkeys, *keys_and_args)` signature.
`redis` itself is only a dev/test dependency of this package (see the
`dev` extra in pyproject.toml) — installing it is the caller's choice, not
this SDK's.
"""

from __future__ import annotations

from inspect import isawaitable
from typing import Any, Protocol, runtime_checkable

from ..types import BucketState, Clock, RateLimitDecision, RateLimitOptions

# ── Lua scripts — copied VERBATIM from packages/sdk-go/redis_limiter.go ──
# Byte-for-byte identical text (module docstring above explains why). Any
# edit here must be made to redis_limiter.go first and mirrored back,
# never authored independently in Python.

LUA_REDIS_GCRA_RATE_LIMIT_SCRIPT = """
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[4])

if intervalUs == nil or burst == nil or nowUs == nil or ttlMs == nil or intervalUs <= 0 or burst <= 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - 1) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000)
    return {0, 0, retryAfterMs, 1}
end

local newTat = math.max(tat, nowUs) + intervalUs
redis.call('SET', KEYS[1], tostring(newTat), 'PX', ttlMs)

local remaining = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
"""

# Read-only variant: reports what the GCRA would decide without advancing
# the theoretical arrival time. Used by Peek (pre-flight queries).
LUA_REDIS_GCRA_PEEK_SCRIPT = """
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])

if intervalUs == nil or burst == nil or nowUs == nil or intervalUs <= 0 or burst <= 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - 1) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000)
    return {0, 0, retryAfterMs, 1}
end

local wouldTat = math.max(tat, nowUs) + intervalUs
local remaining = math.max(math.floor(((burst * intervalUs) - (wouldTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
"""

# Generalized GCRA: consumes n cells atomically instead of exactly one.
# n=1 reduces to LUA_REDIS_GCRA_RATE_LIMIT_SCRIPT exactly (tolerance =
# (burst-1)*interval, newTat = tat + interval); see redis_limiter_test.go
# for the Go-side equivalence check.
LUA_REDIS_GCRA_INCREMENT_SCRIPT = """
local tatRaw = redis.call('GET', KEYS[1])
local nowUs = tonumber(ARGV[3])
local intervalUs = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[4])
local n = tonumber(ARGV[5])

if intervalUs == nil or burst == nil or nowUs == nil or ttlMs == nil or n == nil or intervalUs <= 0 or burst <= 0 or n < 0 then
    return {1, 0, 0, 0}
end

local tat = nowUs
if tatRaw ~= false and tatRaw ~= nil then
    tat = tonumber(tatRaw) or nowUs
end

local tolerance = (burst - n) * intervalUs
local allowAt = tat - tolerance

if nowUs < allowAt then
    local retryAfterMs = math.ceil((allowAt - nowUs) / 1000)
    return {0, 0, retryAfterMs, 1}
end

local newTat = math.max(tat, nowUs) + n * intervalUs
redis.call('SET', KEYS[1], tostring(newTat), 'PX', ttlMs)

local remaining = math.max(math.floor(((burst * intervalUs) - (newTat - nowUs)) / intervalUs), 0)
return {1, remaining, 0, 0}
"""

LUA_REDIS_GCRA_RESET_SCRIPT = """
redis.call('DEL', KEYS[1])
return 1
"""


@runtime_checkable
class RedisLimiterClient(Protocol):
    """The minimal sync Redis contract required by RedisGCRALimiter.

    Mirrors Go's RedisLimiterClient interface: one Eval method. Any object
    with this shape works — including redis-py's own `redis.Redis`
    instance IF `numkeys` is folded into `keys`/`args` first (see
    RedisPyClient below for that adapter).
    """

    def eval(self, script: str, keys: list[str], *args: Any) -> Any: ...


@runtime_checkable
class AsyncRedisLimiterClient(Protocol):
    """Async counterpart of RedisLimiterClient, for `redis.asyncio.Redis`
    or any other asyncio-native client."""

    async def eval(self, script: str, keys: list[str], *args: Any) -> Any: ...


class RedisPyClient:
    """Adapter from a sync `redis.Redis` instance (redis-py) to
    RedisLimiterClient.

    redis-py's native signature is `.eval(script, numkeys, *keys_and_args)`
    — this shim folds `keys`/`args` into that shape. Not a dependency of
    this module (no `import redis` here); construct your own client and
    wrap it:

        import redis
        from rateguard.core.redis_limiter import RedisPyClient, RedisGCRALimiter
        from rateguard.config import system_clock

        client = RedisPyClient(redis.Redis(host="localhost", port=6379))
        limiter = RedisGCRALimiter(client, system_clock())
    """

    __slots__ = ("_client",)

    def __init__(self, client: Any) -> None:
        self._client = client

    def eval(self, script: str, keys: list[str], *args: Any) -> Any:
        return self._client.eval(script, len(keys), *keys, *args)


class AsyncRedisPyClient:
    """Async counterpart of RedisPyClient, over `redis.asyncio.Redis`."""

    __slots__ = ("_client",)

    def __init__(self, client: Any) -> None:
        self._client = client

    async def eval(self, script: str, keys: list[str], *args: Any) -> Any:
        return await self._client.eval(script, len(keys), *keys, *args)


def build_redis_gcra_tier(rps: int, burst: int) -> tuple[int, int, int]:
    """Port of Go's buildRedisGCRATier: converts (rps, burst) into the
    Redis-side GCRA tier constants (interval_us, burst64, ttl_ms).

        interval_us = ceil(1_000_000 / rps)   -- microseconds between cells
        ttl_ms      = ceil(interval_us * burst / 1000)  -- key TTL

    Both divisions round UP (ceiling), never down — an under-estimated
    interval would let the bucket refill faster than the configured rate,
    and an under-estimated TTL could expire the key while cells are still
    "in flight" logically. Matches Go's integer math exactly (Go has no
    integer ceiling division operator either, so both round the same way:
    truncating division, then bumping by 1 if there was a remainder).
    """
    if rps <= 0 or burst <= 0:
        return 0, 0, 0

    window_us = 1_000_000  # time.Second / time.Microsecond
    interval_us = window_us // rps
    if window_us % rps != 0:
        interval_us += 1
    if interval_us < 1:
        interval_us = 1

    burst64 = int(burst)
    ttl_ms = (interval_us * burst64) // 1000
    if (interval_us * burst64) % 1000 != 0:
        ttl_ms += 1
    if ttl_ms < 1:
        ttl_ms = 1

    return interval_us, burst64, ttl_ms


class RedisEvalError(RuntimeError):
    """Raised when a Redis Lua script invocation fails or returns a shape
    the decision-decoding logic doesn't recognize. Mirrors Go returning a
    non-nil error from redisGCRALimiter's methods — callers (runtime.py)
    are expected to treat this as "rate limiter unavailable" and fail
    closed, exactly like Go's HTTPMiddleware does."""


def _decode_result(result: Any) -> tuple[bool, int, int]:
    """Normalize the Lua scripts' 4-element result array
    [allowed, remaining, retry_after_ms, _reserved] into
    (allowed, remaining, retry_after_ms)."""
    try:
        values = list(result)
    except TypeError as exc:
        raise RedisEvalError(f"unexpected redis gcra result: {result!r}") from exc
    if len(values) != 4:
        raise RedisEvalError(f"unexpected redis gcra result: {result!r}")
    allowed = int(values[0]) == 1
    remaining = int(values[1])
    retry_after_ms = int(values[2])
    return allowed, remaining, retry_after_ms


class RedisGCRALimiter:
    """Distributed GCRA rate limiter backed by Redis.

    Same public shape as RateLimiter/ShardedLimiter (allow/allow_async/
    increment/get/reset/peek) so it's a drop-in wherever a limiter is
    expected — including as the limiter RateGuardRuntime builds when
    RateGuardOptions.redis_client is set (see runtime.py, mirroring Go's
    New()'s `case cfg.RedisClient != nil` branch).

    Every admission decision is computed by Lua running INSIDE Redis (see
    the script constants at module scope) — this class is a thin
    dispatcher: build the GCRA tier constants, submit the right script
    with the right ARGV order, decode the 4-element result array. State
    (the "theoretical arrival time") lives only in Redis, so multiple
    process instances sharing the same Redis key get truly synchronized
    admission control — the reason to reach for this over the in-process
    RateLimiter/ShardedLimiter in the first place.
    """

    def __init__(
        self,
        client: RedisLimiterClient | None,
        clock: Clock,
        async_client: AsyncRedisLimiterClient | None = None,
    ) -> None:
        self._client = client
        # Falls back to the sync client for allow_async/peek_async/
        # reset_async when no dedicated async client is supplied. The async
        # dispatch below awaits eval()'s result only when it is actually
        # awaitable, so a plain sync client works there too (as a blocking
        # call on the event loop — same trade the in-memory limiter's
        # allow_async makes). Pass `async_client` explicitly (e.g.
        # AsyncRedisPyClient) for a real non-blocking asyncio path.
        self._async_client = async_client if async_client is not None else client
        self._clock = clock

    def _now_us(self) -> int:
        # This codebase's Clock.now() convention returns epoch
        # milliseconds (see config.py's system_clock) — Redis GCRA state
        # is stored in microseconds, matching Go's
        # clock.Now().UTC().UnixNano() / 1000.
        return int(self._clock.now() * 1000)

    # ── sync path ──

    def allow(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        return self._eval(self._client, key, options, LUA_REDIS_GCRA_RATE_LIMIT_SCRIPT)

    def peek(self, key: str, options: RateLimitOptions) -> RateLimitDecision:
        """Report what allow() would decide right now WITHOUT advancing
        the GCRA state. Pre-flight queries (MCP tools, dashboards) must
        use peek, never allow."""
        return self._eval(self._client, key, options, LUA_REDIS_GCRA_PEEK_SCRIPT)

    def get(self, key: str, options: RateLimitOptions) -> BucketState:
        """Return the current bucket state for key without consuming
        anything — delegates to the read-only peek script, never the
        mutating rate-limit script."""
        decision = self.peek(key, options)
        tokens = float(decision.remaining) if decision.allowed else 0.0
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        return BucketState(tokens=tokens, capacity=burst, limit=rps)

    def increment(self, key: str, options: RateLimitOptions, n: float) -> RateLimitDecision:
        """Consume n cells atomically via the generalized GCRA script.
        increment(key, options, 1) behaves identically to allow(key, options)."""
        return self._eval_n(self._client, key, options, n)

    def reset(self, key: str) -> None:
        """Clear key's bucket; the next access starts from a full bucket."""
        if self._client is None:
            return
        self._client.eval(LUA_REDIS_GCRA_RESET_SCRIPT, [key])

    # ── async path — this codebase's limiters expose both sync and async
    # entry points (see rate_limiter.py's allow/allow_async); Redis-backed
    # admission is itself I/O, so the async path here does a real await
    # instead of just delegating to the sync method. ──

    async def allow_async(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        return await self._eval_async(self._async_client, key, options, LUA_REDIS_GCRA_RATE_LIMIT_SCRIPT)

    async def peek_async(self, key: str, options: RateLimitOptions) -> RateLimitDecision:
        return await self._eval_async(self._async_client, key, options, LUA_REDIS_GCRA_PEEK_SCRIPT)

    async def get_async(self, key: str, options: RateLimitOptions) -> BucketState:
        decision = await self.peek_async(key, options)
        tokens = float(decision.remaining) if decision.allowed else 0.0
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        return BucketState(tokens=tokens, capacity=burst, limit=rps)

    async def increment_async(self, key: str, options: RateLimitOptions, n: float) -> RateLimitDecision:
        return await self._eval_n_async(self._async_client, key, options, n)

    async def reset_async(self, key: str) -> None:
        if self._async_client is None:
            return
        result = self._async_client.eval(LUA_REDIS_GCRA_RESET_SCRIPT, [key])
        if isawaitable(result):
            await result

    # ── shared dispatch ──

    def _eval(self, client: RedisLimiterClient | None, key: str, options: RateLimitOptions, script: str) -> RateLimitDecision:
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        if client is None or rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        interval_us, burst64, ttl_ms = build_redis_gcra_tier(rps, burst)
        if interval_us <= 0 or burst64 <= 0 or ttl_ms <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now_us = self._now_us()
        try:
            result = client.eval(script, [key], interval_us, burst64, now_us, ttl_ms)
        except Exception as exc:  # noqa: BLE001 - re-raised as our own type
            raise RedisEvalError(f"execute redis gcra limiter: {exc}") from exc

        allowed, remaining, retry_after_ms = _decode_result(result)
        return RateLimitDecision(
            allowed=allowed,
            applied=True,
            remaining=remaining if allowed else 0,
            retry_after_ms=retry_after_ms,
            limit=rps,
            degraded=False,
        )

    async def _eval_async(self, client: AsyncRedisLimiterClient | None, key: str, options: RateLimitOptions, script: str) -> RateLimitDecision:
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        if client is None or rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        interval_us, burst64, ttl_ms = build_redis_gcra_tier(rps, burst)
        if interval_us <= 0 or burst64 <= 0 or ttl_ms <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now_us = self._now_us()
        try:
            result = client.eval(script, [key], interval_us, burst64, now_us, ttl_ms)
            if isawaitable(result):
                result = await result
        except Exception as exc:  # noqa: BLE001 - re-raised as our own type
            raise RedisEvalError(f"execute redis gcra limiter: {exc}") from exc

        allowed, remaining, retry_after_ms = _decode_result(result)
        return RateLimitDecision(
            allowed=allowed,
            applied=True,
            remaining=remaining if allowed else 0,
            retry_after_ms=retry_after_ms,
            limit=rps,
            degraded=False,
        )

    def _eval_n(self, client: RedisLimiterClient | None, key: str, options: RateLimitOptions, n: float) -> RateLimitDecision:
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        if client is None or rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        interval_us, burst64, ttl_ms = build_redis_gcra_tier(rps, burst)
        if interval_us <= 0 or burst64 <= 0 or ttl_ms <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now_us = self._now_us()
        try:
            result = client.eval(LUA_REDIS_GCRA_INCREMENT_SCRIPT, [key], interval_us, burst64, now_us, ttl_ms, n)
        except Exception as exc:  # noqa: BLE001 - re-raised as our own type
            raise RedisEvalError(f"execute redis gcra increment: {exc}") from exc

        allowed, remaining, retry_after_ms = _decode_result(result)
        return RateLimitDecision(
            allowed=allowed,
            applied=True,
            remaining=remaining if allowed else 0,
            retry_after_ms=retry_after_ms,
            limit=rps,
            degraded=False,
        )

    async def _eval_n_async(self, client: AsyncRedisLimiterClient | None, key: str, options: RateLimitOptions, n: float) -> RateLimitDecision:
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        if client is None or rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        interval_us, burst64, ttl_ms = build_redis_gcra_tier(rps, burst)
        if interval_us <= 0 or burst64 <= 0 or ttl_ms <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now_us = self._now_us()
        try:
            result = client.eval(LUA_REDIS_GCRA_INCREMENT_SCRIPT, [key], interval_us, burst64, now_us, ttl_ms, n)
            if isawaitable(result):
                result = await result
        except Exception as exc:  # noqa: BLE001 - re-raised as our own type
            raise RedisEvalError(f"execute redis gcra increment: {exc}") from exc

        allowed, remaining, retry_after_ms = _decode_result(result)
        return RateLimitDecision(
            allowed=allowed,
            applied=True,
            remaining=remaining if allowed else 0,
            retry_after_ms=retry_after_ms,
            limit=rps,
            degraded=False,
        )
