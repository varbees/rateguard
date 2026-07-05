"""
Sharded token-bucket rate limiter — a decision-parity port of Go's
sharded_limiter.go, explicitly NOT a lock-free port.

Go's ShardedLimiter is lock-free: bucket state is a single atomic int64
(`fullAtNanos`) updated with a compare-and-swap loop, so admissions on a
hot key proceed without ever taking a lock. That trick works because Go
compiles to real machine code with a real memory model and true
multi-core parallelism across goroutines.

CPython does not have that parallelism to exploit: the GIL means two
Python bytecode instructions never execute truly concurrently, so there
is no lock-free-CAS win available here — and building a C extension to
manufacture one is explicitly out of scope for this port. A "sharded"
Python limiter is therefore NOT faster than a single global lock in the
way the Go docstring means it; don't claim that.

What this module honestly buys instead:

  - Decision parity with Go: identical token-bucket math —
        tokens(now)   = burst - max(0, full_at - now) * rps / 1000   (ms)
        consume n     -> new_full_at = now + (burst - (tokens-n)) / rps * 1000
    and the same fresh-key encoding (full_at = None means a full bucket,
    matching Go's zero-value fullAt=0 — no init write needed for a new
    key), and the same whole-second-ceil Retry-After rounding
    rate_limiter.py's _increment_token_bucket/peek already use. Verified
    against the shared cross-language oracle
    (../../conformance/token_bucket_vectors.json), exactly like
    RateLimiter.
  - Real striped locking: 64 shards, each guarded by its own
    threading.Lock, so two different keys landing in different shards
    genuinely do not block each other under a multi-threaded WSGI worker
    pool — unlike RateLimiter, which serializes every key through one
    global lock. The GIL still means only one thread runs Python bytecode
    at an instant, but threads still block on lock *acquisition* while
    another thread holds it (e.g. mid-refill-calculation) and on the
    kernel-level cost of contended locks; striping keys across 64
    independent locks measurably reduces that queuing for unrelated keys.
    This is a smaller win than Go's lock-free CAS, but it is a real one.
  - A shape that would matter more if this SDK ever ran on a
    free-threaded (no-GIL) CPython build (PEP 703): striping across
    independent locks is the same technique that removes false
    contention there too, so this module needs no structural rework if
    RateGuard ever moves onto one.

Source for the token-bucket formula: https://en.wikipedia.org/wiki/Token_bucket
"""

from __future__ import annotations

from math import ceil
from threading import Lock

from ..types import BucketState, Clock, RateLimitDecision, RateLimitOptions
from .bounded_cache import BoundedCache

# Must be a power of two — shard index is a bitmask, not a modulo.
_SHARD_COUNT = 64
_DEFAULT_CAPACITY = 50_000


class _AtomicBucket:
    """Despite the name (kept for parity with Go's atomicBucket), this is
    an ordinary mutable attribute in Python — see the module docstring for
    why no real atomic/lock-free write is possible or attempted here.

    full_at is the clock-ms instant at which the bucket would be
    completely refilled. None encodes a fresh, full bucket (mirrors Go's
    zero-value fullAt=0 meaning "the distant past") — a freshly seen key
    needs no initialization write.
    """

    __slots__ = ("full_at",)

    def __init__(self) -> None:
        self.full_at: float | None = None


class _Shard:
    """One of the 64 stripes: an independent bounded bucket cache guarded
    by its own lock. Different keys hashing to different shards never
    contend on the same lock."""

    __slots__ = ("lock", "buckets")

    def __init__(self, capacity: int) -> None:
        self.lock = Lock()
        self.buckets: BoundedCache[str, _AtomicBucket] = BoundedCache(capacity)


def _shard_index(key: str, shard_count: int) -> int:
    """FNV-1a hash of key, masked into the shard array. Purely an internal
    distribution detail: admission decisions are computed per-key and
    never depend on which shard a key lands in, so this doesn't need to
    match Go's hash bit-for-bit for cross-language parity — only the
    per-key bucket math does.

    Source: http://www.isthe.com/chongo/tech/comp/fnv/
    """
    h = 14695981039346656037  # FNV offset basis (64-bit)
    for byte in key.encode("utf-8", errors="surrogateescape"):
        h ^= byte
        h = (h * 1099511628211) & 0xFFFFFFFFFFFFFFFF  # FNV prime (64-bit)
    return h & (shard_count - 1)


def _tokens_at(full_at: float | None, now: float, burst: int, rps: int) -> float:
    """tokens(now) = burst - max(0, full_at - now) * rps / 1000, per the
    module docstring's formula (ms clock convention, matching this
    codebase's Clock protocol)."""
    if full_at is None:
        return float(burst)
    deficit = full_at - now
    if deficit <= 0:
        return float(burst)
    tokens = float(burst) - deficit * float(rps) / 1000.0
    return max(0.0, tokens)


def _retry_after_ms(tokens: float, need: float, rps: int) -> int:
    """Whole-second ceil, floored at 1000ms — identical to the formula
    rate_limiter.py's peek()/_increment_token_bucket() use, so Retry-After
    stays unified across both limiter implementations (AGENTS.md rule 13)."""
    deficit = need - tokens
    retry_sec = ceil(deficit / float(rps))
    return max(1000, int(retry_sec * 1000))


class ShardedLimiter:
    """Striped-lock, decision-parity token-bucket limiter.

    Same public shape as RateLimiter (allow/allow_async/increment/get/
    reset/peek) so it's a drop-in alternative wherever a RateLimiter is
    expected — see the module docstring for what "sharded" actually buys
    in CPython (parity + real-but-modest lock striping, not a lock-free
    performance claim).
    """

    def __init__(self, clock: Clock, capacity: int = _DEFAULT_CAPACITY) -> None:
        self._clock = clock
        per_shard = max(1, capacity // _SHARD_COUNT)
        self._shards = [_Shard(per_shard) for _ in range(_SHARD_COUNT)]

    def _shard_for(self, key: str) -> _Shard:
        return self._shards[_shard_index(key, _SHARD_COUNT)]

    def allow(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        return self._increment_token_bucket(key, rps, burst, 1.0)

    async def allow_async(self, key: str, options: RateLimitOptions, **kwargs: object) -> RateLimitDecision:
        return self.allow(key, options)

    def increment(self, key: str, options: RateLimitOptions, n: float) -> RateLimitDecision:
        """Consume n tokens atomically (per-shard lock, not per-bucket CAS
        — see module docstring). increment(key, options, 1) behaves
        identically to allow(key, options)."""
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        return self._increment_token_bucket(key, rps, burst, n)

    def get(self, key: str, options: RateLimitOptions) -> BucketState:
        """Return the current bucket state for key without consuming
        anything. Never creates bucket state for unseen keys."""
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        now = self._clock.now()

        shard = self._shard_for(key)
        with shard.lock:
            bucket = shard.buckets.get(key)
            full_at = bucket.full_at if bucket is not None else None

        tokens = _tokens_at(full_at, now, burst, rps)
        return BucketState(tokens=tokens, capacity=burst, limit=rps)

    def reset(self, key: str) -> None:
        """Clear key's bucket; the next access starts from a full bucket."""
        shard = self._shard_for(key)
        with shard.lock:
            shard.buckets.delete(key)

    def peek(self, key: str, options: RateLimitOptions) -> RateLimitDecision:
        """Report what allow() would decide right now WITHOUT consuming a
        token. Pre-flight queries must use peek, never allow. Never
        creates bucket state for unseen keys."""
        rps = options.requests_per_second or 0
        burst = options.burst or 0
        if rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now = self._clock.now()
        shard = self._shard_for(key)
        with shard.lock:
            bucket = shard.buckets.get(key)
            full_at = bucket.full_at if bucket is not None else None

        if full_at is None:
            return RateLimitDecision(True, True, burst, 0, rps, False)

        tokens = _tokens_at(full_at, now, burst, rps)
        if tokens < 1.0:
            retry_ms = _retry_after_ms(tokens, 1.0, rps)
            return RateLimitDecision(False, True, 0, retry_ms, rps, False)

        return RateLimitDecision(True, True, max(0, int(tokens)), 0, rps, False)

    def _increment_token_bucket(self, key: str, rps: int, burst: int, n: float) -> RateLimitDecision:
        if rps <= 0 or burst <= 0:
            return RateLimitDecision(True, False, -1, 0, -1, False)

        now = self._clock.now()
        shard = self._shard_for(key)

        with shard.lock:
            bucket = shard.buckets.get_or_create(key, _AtomicBucket)
            tokens = _tokens_at(bucket.full_at, now, burst, rps)

            if tokens < n:
                # Denials never consume and need no state write: the
                # deficit already encoded in full_at represents the
                # refilled state at the next access.
                retry_ms = _retry_after_ms(tokens, n, rps)
                return RateLimitDecision(
                    allowed=False,
                    applied=True,
                    remaining=0,
                    retry_after_ms=retry_ms,
                    limit=rps,
                    degraded=False,
                )

            new_tokens = tokens - n
            bucket.full_at = now + (float(burst) - new_tokens) / float(rps) * 1000.0
            return RateLimitDecision(
                allowed=True,
                applied=True,
                remaining=max(0, int(new_tokens)),
                retry_after_ms=0,
                limit=rps,
                degraded=False,
            )
