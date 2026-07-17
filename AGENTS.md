# RateGuard — AI Agent Contract

> **Load this file first.** Every agent working on RateGuard must read this before touching code.
> RateGuard is an AI-native rate limiting SDK for Go, Node.js, and Python — middleware, not a proxy.

## Architecture

```
RateGuard is MIDDLEWARE (runs inside your app process)
  NOT a proxy (LiteLLM, Portkey, Helicone)
  NOT a gateway (Kong, Tyk, Apigee)
  NOT a library (express-rate-limit is JS-only)

Three SDKs, same core behavior with idiomatic language surfaces:
  packages/sdk-go/     → Go (net/http, chi) — reference implementation
  packages/sdk-node/   → Node (Express, Fastify, Hono, Next) — mirrors Go
  packages/sdk-python/ → Python (ASGI, WSGI, FastAPI, Flask) — mirrors Go
```

## Core Algorithm (identical across all 3 SDKs)

```
Token Bucket (RFC standard, same as Kong/Envoy/AWS):
  tokens = min(burst, tokens + elapsed × rps)
  Allow: tokens >= 1.0 → consume 1
  Deny:  retry_after = ceil((1.0 - tokens) / rps) × 1000ms
```

## Feature Inventory

| Feature | Go | Node | Python | Key File (Go) |
|---|---|---|---|---|
| Rate limiting (token bucket) | ✅ | ✅ | ✅ | `limiter.go` |
| Pre-flight Peek (non-consuming query) | ✅ | ✅ | ✅ | `limiter.go` |
| Store primitives (Get/Increment(n)/Reset — variable-cost consumption, key clearing) | ✅ | ✅ | ✅ | `limiter.go`, `sharded_limiter.go`, `redis_limiter.go` |
| LLM token budgets (hr/day/mo) | ✅ | ✅ | ✅ | `token_budget.go` |
| Estimate-based budget reservations | ✅ | ✅ | ✅ | `token_budget.go` |
| Circuit breakers | ✅ | ✅ | ✅ | `circuit_breaker.go` |
| GenAI OTel helpers (semconv span names, input/output tokens, error.type classes) | ✅ | ✅ | ✅ | `genai_observability.go` |
| Public GenAI API (StartGenAICall/GenAISpan, TTFT/TPOT) | ✅ | ✅ | ✅ | Same file |
| 14-model pricing table | ✅ | ✅ | ✅ | Same file |
| Prometheus exposition | ✅ endpoint | ✅ helpers | ✅ helpers | `prometheus.go` |
| Provider chain (routing decisions) | ✅ | ✅ | ✅ | `provider_chain.go` |
| Content guardrails (PII, injection) | ✅ | ✅ | ✅ | `guardrails.go` |
| Guardrails wired into middleware (422) | ✅ | ✅ | ✅ | `sdk.go` |
| 8 presets | ✅ | ✅ | ✅ | `presets.go` |
| Redis distributed limiter (atomic Lua GCRA) | ✅ | ✅ | ✅ | `redis_limiter.go` |
| Events/webhooks (endpoint config → async by default: bounded queue, non-blocking emit, drop-with-counter on overflow, drained by Shutdown/shutdown) | ✅ | ✅ | ✅ | `events.go`, `events_async.go` |
| MCP tools (7: rate limit, budget, breaker, loop, list, attest, verify) | ✅ | ✅ | ✅ | `mcp.go` |
| Lock-free sharded limiter (64-way, atomic CAS) | ✅ | ✅ | ✅ | `sharded_limiter.go` |
| Adaptive rate limiting (AIMD controller) | ✅ | ✅ | ✅ | `adaptive.go` |
| Semantic response caching (pluggable Embedder) | ✅ | ✅ | ✅ | `semantic_cache.go` |
| Static embedder (.rgemb loader, stdlib WordPiece+BertNormalizer, model2vec-conformant — model file is downloaded data, never bundled; `scripts/convert_model2vec.py` converts any potion-style model) | ✅ | ✅ | ✅ | `static_embedder.go` |
| Verified model loading (pin a `.rgemb` by SHA-256; hash-and-compare runs BEFORE any parse, so a tampered file never reaches the parser; digest helper to compute the pin) | ✅ | ✅ | ✅ | `static_embedder.go` |
| Semantic loop detection (paraphrase loops via local embeddings; cosine window, Check/Peek split, threshold 0.90 empirically calibrated — public primitive, NOT yet wired into middleware/outbound) | ✅ | ✅ | ✅ | `semantic_loop.go` |
| Budget attestation (Ed25519 delegation chains) | ✅ | ✅ | ✅ | `budget_attestation.go` |
| Spend receipts (Ed25519-signed proof of spend; integer-only signing payload — unix seconds + micro-USD; caller-fed, RateGuard holds no keys; optional attestation binding) | ✅ | ✅ | ✅ | `spend_receipt.go` |
| Evidence chain (hash-linked receipt log — SHA-256 `prev_hash`, integer-only hashed payload, conformance-locked; catches deletion/reorder/edit; `wantHead` catches wholesale rewrite only if the head was witnessed externally) | ✅ | ✅ | ✅ | `evidence_chain.go` |
| External signer (`Signer` interface — private key lives in a KMS/HSM the process cannot read; mismatched-key and short-signature rejected at issue time; the prerequisite for any "independently verifiable" claim) | ✅ | ✅ | ✅ | `evidence_chain.go` |
| Evidence package export (auditor-ready JSON: entries + head + issuer key + recomputed totals + embedded caveats; `BilledCost`-style honesty — estimates, never invoice truth) | ✅ | ✅ | ✅ | `evidence_chain.go` |
| FOCUS-aligned cost export (core FOCUS columns, tokens via ConsumedQuantity/ConsumedUnit, x_-prefixed extensions; BilledCost always 0 — estimates, never invoice truth) | ✅ | ✅ | ✅ | `focus_export.go` |
| MCP stdio server (zero-dep JSON-RPC) | ✅ | ✅ | ✅ | `mcp_server.go` |
| Loop detection (SHA-256, max-depth, LRU-bounded) | ✅ | ✅ | ✅ | `loop_detector.go` |
| Loop detection wired into middleware (X-Sequence-Depth) | ✅ | ✅ | ✅ | `sdk.go` |
| IETF RateLimit-* response headers | ✅ | ✅ | ✅ | `sdk.go` |
| Realtime session enforcement (voice substrate: OpenAI Realtime + Gemini Live usage parsers — Gemini LIVE-verified 2026-07-10, per-turn semantics proven; per-session guard: total/audio tokens, turns, duration, caller-priced cost; terminal breach + once-only callback; transport-agnostic — integrator feeds frames) | ✅ | ✅ | ✅ | `realtime_usage.go`, `realtime_session.go` |
| Voice framework adapters (Pipecat RateGuardBudgetProcessor + LiveKit Agents attach_rateguard — verified against real pipecat-ai 1.5.0 / livekit-agents 1.6.5; optional `rateguard.integrations.*`, core stays zero-dep; user-facing INTEGRATIONS.md/docs-site recipes land with the v0.3.0 release docs pass) | n/a | n/a | ✅ | `integrations/pipecat_adapter.py` |
| Outbound GenAI transport (WrapClient/wrapFetch/httpx) | ✅ | ✅ | ✅ | `outbound.go` |
| SSE streaming usage extraction (transparent tee) | ✅ | ✅ | ✅ | `sse_usage.go` |
| Provider fallback (OpenAI-compatible, credential-isolated) | ✅ | ✅ | ✅ | `outbound.go` |
| Per-provider circuit breakers (outbound) | ✅ | ✅ | ✅ | `outbound.go` |
| Provider detection (26 hosts + Azure/Bedrock/Vertex + self-hosted) | ✅ | ✅ | ✅ | `outbound.go` |
| Async outbound transport (agent frameworks are async-first) | n/a | n/a | ✅ | `core/outbound.py` |
| Framework integration recipes (INTEGRATIONS.md, doc-verified) | ✅ | ✅ | ✅ | `INTEGRATIONS.md` |
| Admin API — state/policy/MCP-tool-call over HTTP (opt-in, unauthenticated by design — bind privately; CORS same-origin-only by default, configurable single origin, never a wildcard) | ✅ | ✅ | ✅ | `admin.go` |
| Guardrail violation tracking (bounded log + counts by code + Prometheus counter) | ✅ | ✅ | ✅ | `guardrail_log.go` |
| Dashboard control center (`packages/dashboard`: Overview/Analytics/Agents/Controls/MCP Console/Settings; `docker compose up` / `--profile node-demo` / `--profile python-demo`, each demo run end-to-end through the real dashboard) | ✅ | ✅ | ✅ | `packages/dashboard/` |

## 8 Presets

```json
{
  "dev":                    {"rps": 10,   "burst": 20,   "tokens_hr": "1K"},
  "standard":               {"rps": 100,  "burst": 200,  "tokens_hr": "10K"},
  "high-throughput":        {"rps": 1000, "burst": 2000, "tokens_hr": "100K"},
  "streaming-llm":          {"rps": 200,  "burst": 500,  "tokens_hr": "500K",  "mode": "soft-stop"},
  "agent-orchestrator":     {"rps": 500,  "burst": 1000, "tokens_hr": "1M",    "mode": "soft-stop"},
  "llm-heavy":              {"rps": 500,  "burst": 1000, "tokens_hr": "250K",  "mode": "soft-stop"},
  "mcp-server":             {"rps": 30,   "burst": 60,   "tokens_hr": "50K"},
  "strict-upstream-protection": {"rps": 50,  "burst": 75,   "tokens_hr": "5K"}
}
```

## Commands (copy-paste ready)

```bash
# Go tests (225 test funcs, all with -race)
cd packages/sdk-go && CC=/usr/bin/gcc GOWORK=off go test ./...

# Node tests (276 passing)
cd packages/sdk-node && bun run test

# Python tests (296 passing)
cd packages/sdk-python && python3 -m pytest -q

# Python strict typecheck (mypy --strict passes clean on all 51 source files)
cd packages/sdk-python && RATEGUARD_STRICT_TYPES=1 python3 scripts/typecheck.py

# Cross-language conformance (shared oracle, all 3 SDKs replay the same
# admission sequence — see conformance/token_bucket_vectors.json)

# Throughput benchmarks
cd packages/sdk-go && go test -bench=. -benchmem -run=^$ .
cd packages/sdk-node && bun run build && node bench/throughput.mjs
cd packages/sdk-python && python3 bench/throughput.py

# Graphify (codebase to knowledge graph)
cd /path/to/rateguard && graphify update .

# opensrc (pull dependency source)
opensrc path github.com/varbees/rateguard/packages/sdk-go
```

## Rules for agents

1. **Parity across 3 SDKs.** If you add a feature to Go, add it to Node and Python in the same commit or the very next commit. Same algorithm, same API, same behavior.
2. **Tests before merge.** Every commit must pass `go test`, `bun test`, `pytest`.
3. **No new dependencies without reason.** The Go Prometheus endpoint uses stdlib only. Follow that pattern.
4. **Commit as varbees.** Conventional Commits: `feat(sdk-go):`, `fix(sdk-node):`, `docs:`, `chore:`.
5. **No Co-Authored-By.** Author is always `varbees <harshavar968@gmail.com>`.
6. **The SDKs stay proxy-free; companion tools are sanctioned, scoped, and separate.** The core positioning — in-process, zero extra infrastructure — is for code you own. `packages/dashboard` (observability/control-center UI) is a deliberate, explicitly-approved companion tool — it lives in its own `packages/*` directory, depends on the SDK like any consumer, and never gets imported by the SDKs themselves. Billing, marketplace, and multi-tenant-platform code still don't belong here — the legacy full-stack product is on `legacy/full-stack`.
7. **Verify formulas.** Every formula must cite its source (RFC, Wikipedia, academic paper). No hand-waving.
8. **Model pricing must be verifiable.** Every price in the pricing table must be checkable against the provider's public pricing page as of the commit date.
9. **A feature isn't done until it's wired.** A module that exists but isn't exported from the package entry point, isn't reachable through the middleware/facade, or isn't exercised by a test that drives the public surface is NOT a feature — don't mark it ✅ or document it as shipped. (July 2026 audit found MCP tools, guardrails, loop detection, GenAI OTel, and Prometheus counters all existed as files but were unreachable by users.)
10. **Pre-flight queries must never consume.** Anything advertised as a "check before you call" (MCP tools, dashboards) must use Peek/read-only paths — never `Allow()`, which consumes a token, and never `breaker.Allow()`, which claims the half-open probe.
11. **Transports must be byte-transparent.** The outbound wrapper delivers the exact bytes the provider sent — never rewrite line endings, never buffer a stream whole, never alter framing. Usage extraction happens on a bounded side-scan (see `sse_usage.go`).
12. **Streaming usage events must be decoded individually and merged with MAX semantics.** OpenAI sends `"usage":null` in every intermediate chunk; Anthropic splits input (message_start) from output (message_delta) and repeats fields. Concatenating chunks or summing fields double-counts — all three SDKs merge per-event maxima.
13. **Parity claims must be conformance-tested, not assumed.** `conformance/token_bucket_vectors.json` is the shared oracle all 3 SDKs replay (`TestConformanceTokenBucket`, `conformance.test.ts`, `test_conformance.py`) — a passing per-language test suite does not by itself prove cross-language behavioral parity. `retry_after_ms` rounding is unified across all 3 SDKs (ceil to the nearest whole second, floored at 1000ms) and asserted by the conformance vectors on every deny step, including a >1s-deficit case that distinguishes whole-second ceiling from millisecond ceiling. `conformance/budget_attestation_expiry_vectors.json` is the same idea for budget attestation: Go's time.Time JSON marshaling trims trailing zero fractional digits, Python's isoformat emits fixed microseconds, and Node's toISOString emits fixed milliseconds — three different byte strings for the same instant, silently breaking cross-language Ed25519 verification. `expires_at` is truncated to whole seconds before it enters the signing payload in all 3 SDKs (`TestConformanceBudgetAttestationExpiry`, `conformance.test.ts`, `test_conformance.py`) specifically to remove the fractional component that caused the mismatch. `conformance/evidence_chain_vectors.json` extends the same discipline to the evidence chain: a hash-linked log is only verifiable across languages if every SDK hashes identical bytes, so the vectors pin each `entry_hash` and the final `chain_head` against the Go reference (`TestConformanceEvidenceChain`, `conformance.test.ts`, `test_conformance.py`). The hashed payload is `{v, seq, prev_hash, receipt_signature}` — integers and strings only, receipt represented by its signature (which already covers the claims) rather than by re-canonicalizing the claims in three languages.

## Domain types

```json
{
  "AdmissionDecision": {
    "Allowed": "bool",
    "Applied": "bool", 
    "Remaining": "int",
    "RetryAfter": "duration",
    "Limit": "int"
  },
  "TokenBudgetDecision": {
    "Allowed": "bool",
    "Applied": "bool",
    "Queued": "bool",
    "Remaining": "int64",
    "RetryAfter": "duration",
    "Limit": "int64",
    "Window": "hour|day|month",
    "reservationID": "string"
  },
  "CircuitBreakerDecision": {
    "Allowed": "bool",
    "State": "closed|open|half-open",
    "RetryAfter": "duration",
    "ProbeInFlight": "bool"
  },
  "GuardrailViolation": {
    "Code": "pii_detected|prompt_injection|token_limit_exceeded|content_too_long",
    "Message": "string",
    "Score": "0.0-1.0 float"
  },
  "GenAICall": {
    "Model": "gpt-4o|claude-opus-4-5|gemini-2.5-pro|...",
    "Provider": "openai|anthropic|google",
    "Operation": "chat|text_completion|embedding",
    "PromptTokens": "int64",
    "CompletionTokens": "int64",
    "TotalTokens": "int64",
    "Streaming": "bool",
    "StreamChunks": "int64",
    "EstimatedCostUSD": "float64"
  }
}
```

## Sources (verifiable)

- Token Bucket: https://en.wikipedia.org/wiki/Token_bucket
- GCRA: https://en.wikipedia.org/wiki/Generic_cell_rate_algorithm
- OTel GenAI conventions: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai
- OTel HTTP conventions: https://opentelemetry.io/docs/specs/semconv/http
- Prometheus exposition format: https://prometheus.io/docs/instrumenting/exposition_formats/
