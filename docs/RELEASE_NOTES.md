# Release Notes

## Unreleased (v0.2.0-dev) — July 5, 2026, part 4 (Connect proxy: built, then extracted)

A universal reverse proxy (`packages/connect`) was built this cycle — a one-command way to put
RateGuard in front of any OpenAI- or Anthropic-compatible endpoint — and then deliberately removed
from the repository before release (moved to a local fork). The launch story is in-process
middleware; a standalone proxy dilutes that and carries its own operational surface. The
proxy-verification learnings (token extraction confirmed against a real provider response,
`ANTHROPIC_BASE_URL` behavior, Cursor base-URL caveats) fed back into the dashboard docs page.
`AGENTS.md` rule 6 keeps `packages/dashboard` as the single scoped exception to "SDK-only".

## Unreleased (v0.2.0-dev) — July 5, 2026, part 3 (dashboard rebuild + guardrail tracking)

### From single page to real control center
`packages/dashboard` rebuilt on shadcn/ui: a persistent icon-collapsible sidebar, six real
sections (Overview, Analytics, Agents, Controls, MCP Console, Settings) instead of one scrolling
page, animated route transitions, and a branded OKLCH theme (tinted neutrals, amber primary — not
the default flat grayscale shadcn ships with). Connection settings (instance URL, query key) now
persist to localStorage, so a page reload doesn't silently fall back to the default instance —
found this the hard way mid-verification.

### New: MCP Console
`GET /admin/mcp/tools` (the catalog, JSON-Schema included) and `POST /admin/mcp/call` (invoke any
tool directly) — the dashboard's try-it panel calls the *exact* handler function an MCP client
calls over stdio, not a reimplementation.

### New: guardrail violation tracking
Guardrail checks (`checkRequestBody`) previously rejected a violating request but recorded
nothing. A new bounded log (`guardrail_log.go`, 50-event ring buffer + cumulative counts by code)
now tracks every violation — code, message, timestamp, deliberately never the content that
triggered it — reachable via `list_limits`/`/admin/state` and a new
`rateguard_guardrail_violations_total` Prometheus counter. Shown on the dashboard's Agents page.

### Live charts, smoothed
Analytics' throughput chart now applies exponential smoothing to the per-poll rate calculation
(not just the raw delta/elapsed derivative) plus explicit Recharts animation timing, so the line
moves fluidly between polls instead of snapping. Stat card numbers and progress bars animate too.

### Verified against a real LLM call, not just synthetic traffic
Built and tested a standalone reverse-proxy pattern (documented in the dashboard docs page) that
fronts a real OpenAI-compatible provider with RateGuard's middleware — no source changes to the
calling service required, since most agent frameworks already expose a plain `base_url` override.
Confirmed token extraction against a real provider response: reported token count matched the
proxy's tracked count exactly. Caught a real bug doing this — `httputil.NewSingleHostReverseProxy`
doesn't rewrite the HTTP `Host` header, and CloudFront-fronted APIs reject the mismatch with a 403.

### A control center, not just a read-only view
`packages/dashboard` — a self-hosted Next.js control center for a running RateGuard instance:
live token budget (single burn bar for whichever window is closest to exhausted), rate limit
gauge, circuit breaker and loop detection status, cumulative counters from `/metrics`, and a
**tweak panel** that applies policy changes to the live instance with an inline confirm step, not
a modal. Product-register design (system font, restrained color, semantic state pills separate
from the accent) — verified end-to-end against a real running instance, including an actual
applied `SetPolicy` change reflected back from the server.

### The admin API making that possible (Go only)
`rg.AdminHandler()` is new, opt-in, and additive:
- `GET /admin/state?key=` — full snapshot (rate limit, token budget, circuit breaker, loop
  detector), reusing the same handler behind the `list_limits` MCP tool.
- `GET`/`PATCH /admin/policy` — read or atomically override the running policy via the new
  `SDK.SetPolicy` / `SDK.Policy()` (mutex-guarded; `Policy()` replaces a bare struct-field read
  everywhere on the request hot path, including one place — `writePrometheusMetrics` — that
  turned out to still read the field directly and would have raced with `SetPolicy` under
  concurrent load; caught by a dedicated test, not by inspection).
- No authentication by design — same posture as pprof or an unauthenticated Prometheus endpoint.
  Bind to localhost/an internal network, or put your own auth in front of it.
- Permissive CORS on both `/admin/*` and `/metrics` (the latter needed its own fix — it's served
  by a separate handler `AdminHandler`'s CORS wrapper doesn't cover) so the dashboard can read a
  RateGuard instance running on a different port from the browser.

### One-command demo
`docker compose up` from the repo root runs a real RateGuard instance (`examples/dashboard-demo`,
synthetic traffic included so the numbers move from first load) plus the dashboard, pre-wired
together. New docs page: `/docs/dashboard`.

### Known gaps, stated plainly
- Node and Python have no admin handler yet — this session's admin API is Go-only.
- The dashboard's "tweak" panel only covers rate limit and hourly token budget; day/month budgets
  and mode aren't exposed in the UI yet (the API supports all of them).

## Unreleased (v0.2.0-dev) — July 5, 2026, part 1 (Store interface, conformance, benchmarks)

### The composable primitives underneath Allow/Peek
A new `Store` interface — `Get` / `Increment(n)` / `Reset` — sits alongside the
existing `Limiter.Allow`/`Peek` in all 3 SDKs. Fully additive: nothing existing
changed shape or behavior.

- **Get**: raw bucket state (tokens/capacity/limit), never consumes, never
  creates state for an unseen key.
- **Increment(n)**: consume `n` tokens atomically in one call — for a single
  LLM request billed by estimated token count rather than by call count.
  `Increment(..., 1)` is byte-for-byte identical to `Allow`.
- **Reset**: clear a key's bucket outright (admin override, tests, billing-
  cycle boundaries) instead of waiting for the 10-minute idle reset.
- Implemented for every backend: `MemoryLimiter`, the lock-free
  `ShardedLimiter`, and the Redis GCRA limiter (`Increment` generalizes the
  GCRA tolerance/TAT math to a variable cell cost `n`; `Reset` is a `DEL`
  script). See `packages/sdk-go/limiter.go`, `sharded_limiter.go`,
  `redis_limiter.go`.

### Cross-language conformance suite
`conformance/token_bucket_vectors.json` is a single shared oracle — a policy
plus a sequence of `(advance_ms, n, expected allowed, expected remaining)`
steps — replayed by all 3 SDKs against their own `Store.Increment`
(`TestConformanceTokenBucket` in Go, `conformance.test.ts` in Node,
`test_conformance.py` in Python). This proves real behavioral parity, not
just that each SDK's own test suite passes in isolation.

**Known gap surfaced by building this:** `retry_after_ms` rounding currently
differs across SDKs — Go rounds up to the nearest whole second, Node/Python
round up to the nearest whole millisecond (floored at 1000ms). The vectors
deliberately check only `allowed`/`remaining` until that's unified; see
AGENTS.md rule 13.

### Throughput benchmarks, all 3 languages
Go already had `b.RunParallel` concurrent-load benchmarks
(`sharded_limiter_test.go`); Node (`bench/throughput.mjs`) and Python
(`bench/throughput.py`) now have matching hot-key / many-key throughput
scripts. Measured on a dev laptop (i5-9300H) — not a server-grade claim, just
a reproducible baseline:

| | Hot key | Many keys (1024) | Notes |
|---|---|---|---|
| Go — MemoryLimiter | 223 ns/op (~4.5M ops/s) | 472 ns/op (~2.1M ops/s) | concurrent (8 goroutines), 0 allocs |
| Go — ShardedLimiter | 149 ns/op (~6.7M ops/s) | 55.5 ns/op (~18M ops/s) | concurrent (8 goroutines), 0 allocs |
| Node | 163 ns/op (~6.1M ops/s) | 105 ns/op (~9.5M ops/s) | single-threaded (no real parallelism for this op) |
| Python | 1946 ns/op (~514K ops/s) | 1915 ns/op (~522K ops/s) | single-threaded (GIL) |

Go's numbers are concurrent (multiple goroutines contending for the same
limiter); Node/Python numbers are sequential single-threaded throughput —
these are not directly comparable across languages without also modeling
each runtime's real concurrency story (multi-process for Node, multi-process
or async for Python).

### Test counts
Go 126 (+8 from Store/conformance) · Node 52 (+6) · Python 54 (+6) — 232 total.

### Also this session
- `_cofounder/rateguard-competitive-intel-2026-07-04.md`: the "Store
  abstraction" gap identified there is closed (see status update at top of
  that file).
- Landing page rebuilt (`site/app/page.tsx`): scroll-driven narrative,
  corrected stat counters, real token-bucket-driven signature visual.
- Agent-facing discovery closed a real gap: `rateguard.jsonld` existed in the
  repo but was never copied into `site/public/` — it was never actually
  served. Now served at `/rateguard.jsonld` and linked via
  `<link rel="alternate" type="application/ld+json">` in the homepage head.
  Added `robots.txt` (points to `llms.txt` and `sitemap.xml`) and a
  Next.js-native `sitemap.ts` covering every docs page.

## Unreleased (v0.2.0-dev) — July 4, 2026 (outbound transport, all 3 SDKs)

### Guard the money, not just the door 💸
The outbound GenAI transport ships across Go, Node, and Python. Wrap the HTTP
client your LLM SDK already uses — every call is budgeted, breaker-protected
per provider, and metered with REAL token usage:

- **Go**: `rg.WrapClient(&http.Client{})` / `rg.Transport(next, opts)`
- **Node**: `rg.wrapFetch()` — pass to any SDK accepting a custom fetch
- **Python**: `rg.wrap_httpx_client()` / `create_httpx_transport(runtime)` —
  the OpenAI and Anthropic SDKs run on httpx and accept `http_client=`.
  httpx stays a lazy import; RateGuard keeps zero runtime dependencies.

Capabilities (identical across SDKs, verified by mirrored test suites):
- **Provider detection**: 16 OpenAI-compatible hosts (OpenAI, DeepSeek, Groq,
  Mistral, Together, OpenRouter, xAI, Perplexity, Moonshot, Fireworks,
  Cerebras, Cohere, DashScope, SambaNova, NVIDIA) + Anthropic, Gemini
  (native and OpenAI-compat paths), Vertex AI, Azure OpenAI, AWS Bedrock
  (incl. camelCase `inputTokens`/`outputTokens` usage fields), and any
  self-hosted `/chat/completions` server (vLLM, llama.cpp, LocalAI).
- **Streaming done right**: SSE bytes pass through untouched (transparent
  tee); usage is extracted from a bounded side-scan. OpenAI `usage:null`
  intermediates and Anthropic's split `message_start`/`message_delta` are
  decoded per-event and merged with MAX semantics (summing double-counts).
- **Provider fallback** across OpenAI-compatible endpoints on 429/5xx/
  breaker-open, with credential isolation (Authorization/x-api-key never
  transfer) and model override. Fallback targets follow the OpenAI-SDK
  convention: baseURL owns the version prefix. Cross-schema fallback is
  impossible at the transport layer and is not claimed.
- **Per-provider circuit breakers** — an OpenAI outage doesn't trip DeepSeek.
- **Enforce vs observe modes**: enforce synthesizes provider-native 429/503
  responses (with Retry-After) so SDK retry logic just works; observe never
  blocks, only meters.
- **Prometheus**: `rateguard_outbound_calls_total`,
  `rateguard_outbound_fallbacks_total`.

### Extractor correctness fixes (all 3 SDKs)
- Usage merge switched from SUM to MAX semantics — streaming providers
  repeat and refine usage across events; summing double-counted Anthropic.
- Bedrock Converse camelCase aliases (`inputTokens`/`outputTokens`/
  `totalTokens`) added everywhere.
- Node/Go: Anthropic's nested `message.usage` (message_start) now extracted.

### Fixed from the first outbound draft
- SSE wrapper rewrote wire bytes (`\r\n`→`\n`) via line-scanner passthrough,
  concatenated usage chunks into un-decodable JSON (breaking OpenAI
  `include_usage` extraction), grew unboundedly on long streams, and
  inflated chunk counts ~2-3x. Replaced with a transparent tee + bounded
  per-event candidate scan.
- Request-body passthrough for >10 MiB bodies read from an already-closed
  body. `req.GetBody` now set for HTTP/2 replays.

### Async transport + framework integrations 🆕
- **Python async transport**: `create_httpx_async_transport` /
  `rg.wrap_httpx_async_client()` — agent frameworks are async-first (the
  OpenAI Agents SDK, Pydantic AI, and LangChain's async paths all run on
  `httpx.AsyncClient`). Full parity with the sync transport, including
  transparent SSE streaming and fallback. 5 async e2e tests.
- **INTEGRATIONS.md**: one-line recipes verified against official docs —
  OpenAI/Anthropic SDKs (Go/Node/Python), LangChain/LangGraph
  (`http_client` + `http_async_client`), OpenAI Agents SDK
  (`set_default_openai_client`), Pydantic AI, Vercel AI SDK
  (`createOpenAI({fetch})`), Mastra. CrewAI documented honestly (no client
  injection today — tracked upstream).

Tests: **155 across the three SDKs** (Go 61, Node 46, Python 48) — every
outbound scenario driven end-to-end against mock providers, including both
real streaming shapes and fallback credential isolation.

## Earlier July 4, 2026 (late-night wiring release)

### Everything advertised is now reachable 🔌
A source-level audit found several headline features existed as modules but were not
wired into the middleware or exported from package entry points. This release closes
that gap — features are now real, tested through the public surface, and demoable:

- **MCP stdio server (Go)** 🆕: `rg.ServeMCP(ctx, stdin, stdout)` — zero-dependency
  JSON-RPC 2.0 implementing `initialize`, `tools/list`, `tools/call`, `ping`. Plug
  RateGuard into Claude Code/Desktop/Cursor as an MCP server.
- **MCP tools now in all 3 SDKs** (were Go-only): 5 tools including new `check_loop`.
  Node: `rg.mcpTools()` / `rg.mcpCall()`. Python: `rg.mcp_tools()` / `rg.mcp_call()`.
- **Peek semantics** 🆕: every limiter implements a non-consuming `Peek` (memory,
  Redis read-only Lua, noop). MCP pre-flight queries no longer consume the caller's
  budget (they previously called `Allow`, burning a token per query), and the
  breaker query no longer claims the half-open probe slot.
- **Prometheus runtime counters wired (Go)**: `/metrics` now reports live
  `rateguard_requests_total`, rate limit hits, budget exhaustion, breaker trips,
  tokens consumed, and loop detector stats (counters previously existed but were
  never incremented or rendered).
- **GenAI OTel public API (Go)** 🆕: `StartGenAICall` → `GenAISpan.End` with
  automatic cost estimation and TTFT/TPOT from `RecordChunk()`. The observer was
  previously unreachable dead code.
- **GenAI semconv corrections (all 3 SDKs)**: span/attribute helpers now use
  `{operation} {model}`; `gen_ai.usage.input_tokens`/`output_tokens` replace the
  deprecated prompt/completion names; `error.type` is a low-cardinality class, not
  the full error message; RateGuard-specific attributes moved to `rateguard.*`.
- **Loop detection hardened + wired**: `maxDepth` is now enforced (was stored but
  never used), fingerprint maps are LRU-bounded (were unbounded — a memory leak),
  and Go middleware blocks loops via the `X-Sequence-Depth` header (429
  `loop_detected`). Node/Python loop detectors gained the same fixes plus `peek`.
- **Guardrails wired into Go middleware**: set `Config.Guardrails` and violating
  request bodies return 422 (previously a standalone library the middleware ignored).
- **Token budget concurrency fix (Go)**: hard-stop reservations previously reserved
  the *entire remaining budget* per in-flight request, serializing concurrent
  traffic on a budget key. New `Config.EstimatedTokensPerRequest` bounds the
  reservation so concurrent requests proceed; default behavior unchanged.
- **Response buffering capped (Go)**: token-extraction buffering is limited to 1 MiB
  (configurable via `Config.MaxBufferedResponseBytes`) — streaming responses are no
  longer buffered whole in memory.
- **IETF `RateLimit-*` headers (Go)**: standard `RateLimit-Limit/Remaining/Reset`
  emitted alongside `X-RateGuard-*` (draft-ietf-httpapi-ratelimit-headers).
- **Pricing corrections (all 3 SDKs)**: Claude Opus 4.5 → $5/$25 per MTok.
  Table is 12 configured models — earlier docs claiming 28 were wrong.
- **Provider chain honesty**: documented as a routing-decision helper (the app
  performs the call); `Weight` is now assigned from chain position (was
  accidentally the length of the provider name).

Tests: Go 51 / Node 38 / Python 34 — all green, with new end-to-end wiring tests
that drive every advertised feature through the public surface.

## Earlier July 4, 2026 work (v0.2.0-dev)

### GenAI Observability 🆕
- OpenTelemetry `gen_ai.*` semantic-convention helpers (v1.29.0) for Go, Node.js, and Python; Go also exposes the public span API.
- **OTel compliance fixes (July 4):** `gen_ai.system` → `gen_ai.provider.name`, `error.type` on error spans, TTFT/TPOT streaming latency attributes, `gen_ai.conversation.id` / `gen_ai.response.id` span attributes.
- 12-model pricing table for OpenAI, Anthropic, Google, Llama, and DeepSeek families.
- `estimateCost()` across all 3 SDKs. Unknown models return $0.00 — never fabricate costs.
- Streaming chunk telemetry via `RecordStreamChunk()`.

### Rate Limiting Algorithm Fix ⚠️
- Fixed Python and Node.js rate limiters: were using sliding window with incorrect `capacity = rps + burst` formula (3x too permissive). Now use identical **Token Bucket** algorithm across all 3 SDKs, matching Go's original implementation.
- Formula: `tokens = min(burst, tokens + elapsed × rps)`, allow if `tokens >= 1.0`.
- All 3 SDKs now document the algorithm inline with RFC citation.

### 3 New Presets 🆕
- `streaming-llm`: 200 RPS, 500K tokens/hr, soft-stop. For real-time LLM streaming workloads.
- `agent-orchestrator`: 500 RPS, 1M tokens/hr, 1B tokens/month. For multi-agent AI systems.
- `mcp-server`: 30 RPS, 50K tokens/hr, hard-stop. For MCP tool servers (low request count, high tool calls).
- **Python presets parity (July 4):** All 8 presets now available in Python SDK (was 5). `known_presets()` added to Python public API.

### Provider Chain 🆕
- Automatic LLM provider fallback when circuit breaker opens.
- 3 preset chains: `DefaultProviderChain` (cost-optimized), `BudgetProviderChain` (cheapest-first), `QualityProviderChain` (best-first).
- Provider transparency headers (`X-RateGuard-Provider`, `X-RateGuard-Fallback`).
- Available in Go, Node.js, and Python with identical API.

### Content Guardrails 🆕
- Pluggable prompt-level safety checks. `Guardrail` interface with `Check() → GuardrailViolation`.
- Built-in: PII detection (credit cards, email, phone, SSN), prompt injection detection (5 attack vectors), token limit, content length limit.
- `StandardGuardrails()` and `StrictGuardrails()` preset chains.
- Available in Go, Node.js, and Python with identical patterns.

### Prometheus Metrics 🆕
- Go `Metrics()` handler serves Prometheus exposition format. Node/Python expose text helpers for app-mounted endpoints.
- Exposes: rate limit config, token budget config, circuit breaker state, SDK version/info.

### Docs
- New `README.md` with feature matrix, vs-competition table, and quick starts.
- New `API_REFERENCE.md` with all 8 presets, config options, middleware adapters, provider chain, guardrails, and events.
- New `GENAI_OBSERVABILITY.md` with span attributes, metrics, model pricing, and backend integration.
- Updated `ARCHITECTURE.md` with positioning vs Datadog/Kong/Cloudflare.

### Cross-Language Parity
Core algorithms and library surfaces ship across Go, Node.js, and Python; middleware wiring is called out where it is language-specific:
- Token bucket rate limiting ✅
- LLM token budgets ✅
- Circuit breakers ✅
- GenAI OTel helpers ✅; public span API ✅ Go
- Provider chain ✅
- Content guardrails ✅; middleware 422 wiring ✅ Go
- 8 presets ✅

---

## v0.1.0

Release date: 2026-05-16

RateGuard `v0.1.0` is the first middleware-first SDK release under the
`varbees/rateguard` repo.

### Packages

| Runtime | Package | Install |
| --- | --- | --- |
| Go | `github.com/varbees/rateguard/packages/sdk-go` | `go get github.com/varbees/rateguard/packages/sdk-go@v0.1.0` |
| Node.js | `@varbees/rateguard-node` | `npm install @varbees/rateguard-node@0.1.0` |
| Python | `varbees-rateguard` | `pip install varbees-rateguard==0.1.0` |

### Highlights

- In-process rate limiting for service middleware.
- Token budget helpers for LLM-heavy paths.
- Circuit breaker support.
- Request event emission with local console fallback.
- Go `net/http` and chi middleware.
- Node Express, Fastify, Hono, and Next route-handler support.
- Python ASGI, WSGI, decorators, and high-level budget helpers.

### Published Artifacts

- Go module tag: `packages/sdk-go/v0.1.0`
- npm package: `@varbees/rateguard-node@0.1.0`
- PyPI package: `varbees-rateguard==0.1.0`

### Verification

```bash
cd packages/sdk-go
CC=/usr/bin/gcc GOWORK=off go test ./...
GOPROXY=proxy.golang.org go list -m github.com/varbees/rateguard/packages/sdk-go@v0.1.0
```

```bash
cd packages/sdk-node
bun run typecheck
bun run test
npm publish --dry-run --access public
npm view @varbees/rateguard-node version
```

```bash
cd packages/sdk-python
RATEGUARD_STRICT_TYPES=1 python3 scripts/typecheck.py
python3 -m pytest -q
python3 -m build --sdist --wheel
python3 -m twine check dist/*
python3 -m pip index versions varbees-rateguard
```

### Known Constraints

- Go publishing uses the submodule tag form `packages/sdk-go/vX.Y.Z`.
- Python installs from the distribution name `varbees-rateguard`, while the
  import package remains `rateguard`.
- The SDKs are intentionally standalone-first; hosted control-plane behavior is
  not part of this release.
