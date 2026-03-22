# Algorithmic Contracts

These are the production-hardened choices. Do not replace them casually.

## Rate Limiter

- Algorithm: GCRA via atomic Redis Lua.
- Why: removes fixed-window boundary spikes and makes retry-after deterministic.
- Invariant: one Redis roundtrip for the decision path.
- On Redis error: fail-safe-allow plus a degraded event to the realtime spine.

## Circuit Breaker

- Algorithm: 3-state FSM with a rolling outcome window.
- Why: consecutive-failure-only logic can miss unhealthy upstreams that recover just enough to avoid tripping.
- Invariant: last 100 outcomes, configurable error-rate threshold, single half-open probe, two consecutive successes to close.

## Queue Admission

- Algorithm: event-driven per-request channel wakeup.
- Why: polling loops create timer churn and hide backpressure.
- Invariant: atomic admission check, FIFO waiter release, immediate 429 when full, timeout returns 503.

## Token Budget

- Algorithm: rolling hourly, daily, and monthly window.
- Why: keeps hard-stop / soft-stop behavior stable across request patterns.
- Invariant: hard-stop before upstream when exhausted, soft-stop emits warning, streaming uses final SSE usage extraction.

## Bounded Caches

- Go SDK: ARC cache.
- Node SDK: `lru-cache`.
- Python SDK: `cachetools.LRUCache`.
- Invariant: no hot-path unbounded `map[string]*bucket` equivalents.
