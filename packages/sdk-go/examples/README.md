# Examples

Runnable, self-contained demonstrations of RateGuard's Go SDK. Each one uses
a local `httptest` server standing in for a real provider, so `go run` works
with no API key and no network access.

```bash
cd packages/sdk-go
go run ./examples/runaway-demo          # a runaway agent burning a budget, then RateGuard halting it
go run ./examples/quickstart            # outbound wrapping — the headline feature
go run ./examples/semantic-cache        # a paraphrase served from cache, not the network
go run ./examples/adaptive-rate-limit   # the AIMD controller cutting and recovering
go run ./examples/budget-attestation    # a two-hop delegation, narrowed and verified
```

| Example | Shows |
|---|---|
| [`runaway-demo`](runaway-demo/main.go) | A real wrapped client burning a token budget call by call, then RateGuard halting the loop at the budget line. The launch demo asset; see its README to record it as a GIF. |
| [`quickstart`](quickstart/main.go) | `WrapClient` in one line; real token usage extracted and metered; Prometheus counters. |
| [`semantic-cache`](semantic-cache/main.go) | A prompt paraphrase hitting the cache — 2 real upstream calls for 3 prompts. |
| [`adaptive-rate-limit`](adaptive-rate-limit/main.go) | The effective rate limit cutting to its floor under a failing upstream, then climbing back once healthy. |
| [`budget-attestation`](budget-attestation/main.go) | Minting a root budget, delegating a narrower slice, rejecting a widening attempt, and verifying proof of possession. |

Each file's own comment explains any demo-only shortcuts (a toy embedder, a
disabled circuit breaker so one feature can be observed in isolation) — none
of those shortcuts belong in production code, and each is called out where
it appears.
