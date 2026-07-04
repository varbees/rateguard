# Release Notes

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

Tests: **150 across the three SDKs** (Go 61, Node 46, Python 43) — every
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
- **Prometheus runtime counters wired**: `/metrics` now reports live
  `rateguard_requests_total`, rate limit hits, budget exhaustion, breaker trips,
  tokens consumed, and loop detector stats (counters previously existed but were
  never incremented or rendered).
- **GenAI OTel public API (Go)** 🆕: `StartGenAICall` → `GenAISpan.End` with
  automatic cost estimation and TTFT/TPOT from `RecordChunk()`. The observer was
  previously unreachable dead code.
- **GenAI semconv corrections (all 3 SDKs)**: span names are now
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
- **Pricing corrections (all 3 SDKs)**: Claude Opus 4.5 → $5/$25 per MTok, o3 →
  $2/$8 per MTok, verified against provider pricing pages. Table is 14 models —
  earlier docs claiming 28 were wrong.
- **Provider chain honesty**: documented as a routing-decision helper (the app
  performs the call); `Weight` is now assigned from chain position (was
  accidentally the length of the provider name).

Tests: Go 51 / Node 38 / Python 34 — all green, with new end-to-end wiring tests
that drive every advertised feature through the public surface.

## Earlier July 4, 2026 work (v0.2.0-dev)

### GenAI Observability 🆕
- OpenTelemetry `gen_ai.*` semantic conventions (v1.29.0) for Go, Node.js, and Python.
- **OTel compliance fixes (July 4):** `gen_ai.system` → `gen_ai.provider.name`, `error.type` on error spans, TTFT/TPOT streaming latency histograms, `gen_ai.conversation.id` / `gen_ai.response.id` span attributes.
- 14-model pricing table, verified against provider pricing pages (OpenAI, Anthropic, Google, Llama, DeepSeek).
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
- `Metrics()` handler serving Prometheus exposition format. Zero dependencies, stdlib only.
- Exposes: rate limit config, token budget config, circuit breaker state, SDK version/info.

### Docs
- New `README.md` with feature matrix, vs-competition table, and quick starts.
- New `API_REFERENCE.md` with all 8 presets, config options, middleware adapters, provider chain, guardrails, and events.
- New `GENAI_OBSERVABILITY.md` with span attributes, metrics, model pricing, and backend integration.
- Updated `ARCHITECTURE.md` with positioning vs Datadog/Kong/Cloudflare.

### Cross-Language Parity
All new features ship in Go, Node.js, and Python with identical behavior:
- Token bucket rate limiting ✅
- LLM token budgets ✅
- Circuit breakers ✅
- GenAI OTel observability ✅
- Provider chain ✅
- Content guardrails ✅
- 8 presets ✅ (Go + Node), ✅ Go + Node (Python: presets in config)

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
