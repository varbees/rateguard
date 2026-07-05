"""Real throughput benchmark for RateLimiter.increment(), mirroring the two
scenarios in sdk-go/sharded_limiter_test.go (hot key, many keys). CPython's
GIL means concurrent threads don't add real parallelism for this operation —
the honest number here is single-threaded ops/sec, the actual ceiling one
Python process hits under load.

Run: python3 bench/throughput.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rateguard import RateLimiter
from rateguard.types import RateLimitOptions


class SystemClock:
    def now(self) -> float:
        return time.time() * 1000


def bench(name: str, keys: int, iterations: int) -> None:
    limiter = RateLimiter(SystemClock(), capacity=50_000)
    options = RateLimitOptions(requests_per_second=1_000_000, burst=1_000_000)
    key_set = [f"tenant-{i}" for i in range(keys)]

    start = time.perf_counter_ns()
    for i in range(iterations):
        limiter.increment(key_set[i % keys], options, 1.0)
    end = time.perf_counter_ns()

    total_ns = end - start
    ns_per_op = total_ns / iterations
    ops_per_sec = 1e9 / ns_per_op
    print(f"{name:<24} {ns_per_op:>10.1f} ns/op   {ops_per_sec:>14,.0f} ops/sec")


if __name__ == "__main__":
    print(f"python {sys.version.split()[0]}")
    bench("HotKey", 1, 500_000)
    bench("ManyKeys (1024)", 1024, 500_000)
