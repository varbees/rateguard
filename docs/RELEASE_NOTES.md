# Release Notes

## v0.4.0 — 2026-07-17 — "Attribution, Kill Switch, and Proof"

`v0.4.0` is the release that makes RateGuard usable by an operator under
pressure: know whose spend it was, stop it without a redeploy, and hand
someone a record afterward that holds up. It also closes a denial-of-wallet
hole that made budgets fail open on the most common streaming setup.

**Install note.** npm and PyPI were still serving `0.2.0` — `0.3.0` shipped to
the Go proxy and the docs but never reached the other two registries. `0.4.0`
publishes all three together. If you installed from npm or PyPI before today,
you did not have the v0.3.0 feature set the docs describe.

### Highlights

- **Budgets no longer fail open on unmeasured streams.** `finish()` recorded
  **zero** tokens whenever provider usage was unmeasurable — a stream without
  `stream_options.include_usage` (the default), a body over the buffer cap, or
  an unrecognized schema. A runaway agent streaming without `include_usage`
  never tripped its budget: the budget silently failed open to unlimited spend
  on the most common production pattern. It now commits the reserved estimate
  instead of zero, counted separately as `rateguard_tokens_estimated_total` so
  estimated spend is never mistaken for measured spend. Byte transparency
  ruled out LiteLLM-style request injection; we take the passive path and
  charge an estimate rather than nothing.
- **Per-customer cost attribution.** `X-RateGuard-Customer` scopes budgets and
  spend per customer, is stripped before the provider ever sees it, survives
  fallback, and lands as a `rateguard.customer` OTel attribute.
- **Runtime kill switch.** `Freeze("")` halts everything; `Freeze("<customer>")`
  halts one. Frozen calls get a synthesized 403; observe mode is unaffected.
  Driveable from the admin API (`POST /admin/freeze|unfreeze`,
  `GET /admin/frozen`) so ops can stop the bleeding without a redeploy.
- **Enforcement audit trail.** A bounded ring buffer records every frozen /
  rate-limited / budget-exceeded block with timestamp, customer, provider,
  model, and detail. Two pull-side read paths, no webhook: in-process
  `enforcement_events()` and `GET /admin/events` (JSON, `?limit=N`,
  `?format=csv` for finance).
- **Evidence chain — tamper-evident spend history.** A signed receipt proves
  one statement was not altered; it proves nothing about the *set*. An issuer
  holding its own key could drop the expensive receipts, renumber the rest,
  and re-sign a tidier history with every remaining receipt still verifying.
  `EvidenceChain` links each entry to the hash of the one before it, so a
  deletion, reorder, or edit breaks every subsequent hash, and the chain
  yields one head standing for the whole history.
- **External signers (KMS/HSM).** The new `Signer` interface routes the
  signing payload to a key the process cannot read. A signer that advertises
  one key and signs with another, or returns a wrong-length signature, is
  rejected at issue time rather than months later in an auditor's hands.
- **Evidence package export.** One auditor-facing artifact: entries, head,
  issuer key, and totals that are recomputed on verify so the summary cannot
  become a place to hide spend. Its caveats travel inside the file.
- **Pin your embedding model by SHA-256.** `.rgemb` files are downloaded data,
  so the bytes reaching the loader come from wherever the operator got them.
  `LoadStaticEmbedderVerified` / `loadVerified` / `load_verified` hash the file
  in full **before parsing any of it** — a file that fails the check never
  reaches the header parser, the vocab loop, or the matrix read.
- **CJK-aware token estimation.** The naive `chars/4` estimate undercounted CJK
  by up to 75%, so a CJK prompt could slip past a token-sized limit — a
  denial-of-wallet hole for non-English workloads. It also disagreed across
  languages (Go counted bytes, Node UTF-16 units, Python code points: three
  estimates for one string). Now ~1 token per CJK code point, ~4 chars/token
  otherwise, iterated by code point, locked by conformance vectors. The
  `Tokenizer` interface is the plug-in point for exact counts (tiktoken); the
  default stays zero-dependency.
- **User-owned custom pricing.** The pricing table used exact-match, so tabled
  models priced at $0 on the dated IDs providers actually report
  (`gpt-4o-2024-08-06`). Adds a `PricingProvider` interface, `StaticPricing`,
  and dated-ID normalization. We deliberately did **not** auto-fetch a
  community pricing JSON at startup — that reintroduces the network and
  supply-chain dependency this SDK exists to avoid.
- **CrewAI adapter (Python).** `wrap_completion` / `wrap_acompletion` meter from
  the response, because litellm's client_session injection is
  provider-inconsistent and metering the request would leave a silent gap.

### What the evidence chain does and does not prove

Read this before repeating any of it to a buyer.

The chain makes **selective** edits detectable on its own. It does **not**, by
itself, make a wholesale rewrite detectable: an issuer with its own key can
rebuild the chain from entry zero and publish a new head. Two things close
that, and an in-process SDK cannot supply either:

1. **The signing key must live where the application cannot read it.** A log
   signed by a key the audited process holds is not independently verifiable.
   That is what `Signer` is for.
2. **The head must be witnessed outside the application** — published,
   timestamped, or written to append-only storage on a cadence. A head nobody
   recorded is a head you can silently replace.

With both, this produces audit **inputs** an assessor can work from. RateGuard
ships components for an evidence trail. It does not make a deployment
compliant, and it should never be sold as if it did. Costs throughout are
pricing-table **estimates**, not provider invoices — reconcile against billing
and expect drift.

### Verification

- Go 225 test funcs (all `-race`), `go vet` clean.
- Node 276 passing, `tsc --noEmit` clean — the Node typecheck was failing on
  pre-existing strict-index errors before this release and is now green. A
  gate that is always red hides real regressions.
- Python 296 passing, `mypy --strict` clean across 52 source files.
- New shared oracle: `conformance/evidence_chain_vectors.json` pins every
  `entry_hash` and the final `chain_head` against the Go reference, because a
  hash-linked log is only verifiable across languages if all three hash
  identical bytes. Joins the existing token-bucket, attestation-expiry,
  spend-receipt, realtime-usage, static-embedding, and token-estimate vectors.

### Upgrading

No breaking API changes from `0.3.0`. Coming from `0.2.0` (npm/PyPI users:
that is you), read the `v0.3.0` notes below as well.

---

## v0.3.0 — 2026-07-10 — "The Enforcement Release"

RateGuard `v0.3.0` extends enforcement to where agents actually run: voice
pipelines, reworded loops, and the compliance ledger. Every feature ships in
all 3 languages with cross-language conformance vectors, several of them
generated from live APIs or reference libraries rather than hand-written
fixtures.

### Highlights

- **Realtime voice session enforcement.** Voice sessions are one WebSocket that
  can burn dollars per minute for hours; per-request rate limiting is
  structurally blind to them. New usage parsers for OpenAI Realtime
  (documented `response.done` schema; live verification pending — no free
  tier) and Gemini Live (**live-verified against the real API**: usage is
  per-turn, proven with a two-turn session), plus a per-session
  `RealtimeSessionGuard` with limits on total tokens, audio tokens, turns,
  wall-clock duration, and caller-priced cost estimates. Terminal on breach,
  once-only callback; `Peek` never mutates; frames are never rewritten.
  `conformance/realtime_usage_vectors.json` contains real captured Gemini
  frames.
- **Pipecat + LiveKit Agents adapters (Python).** Production voice runs
  through frameworks that terminate media server-side — so enforcement lives
  inside them: `rateguard.integrations.pipecat_adapter` (a drop-in
  `FrameProcessor`; breach pushes Pipecat's own fatal-error stop) and
  `rateguard.integrations.livekit_adapter` (`attach_rateguard` on
  `metrics_collected`, with full audio/text/cached token splits). Verified
  against pipecat-ai 1.5.0 and livekit-agents 1.6.5 as installed. Optional
  imports — the core package stays zero-dependency.
- **Semantic loop detection.** SHA-256 fingerprinting catches byte-identical
  repeats; it provably cannot catch an agent repeating itself *in different
  words* — the documented $47K two-agent incident shape. The new
  `SemanticLoopDetector` embeds each step locally and compares against a
  sliding window; the 0.90 default threshold is empirically calibrated
  (reworded repeats score 0.92–0.99, same-template/different-entity workloads
  ≤0.80, distinct steps <0.67).
- **Local static embedder, zero inference dependencies.** Loads
  model2vec/potion-style models from RateGuard's `.rgemb` format
  (`scripts/convert_model2vec.py`, checksum printed at conversion; models
  load from a local path — nothing is downloaded at runtime, nothing is
  bundled). WordPiece + BertNormalizer reimplemented on each language's
  stdlib; token ids are byte-exact with the reference HF tokenizer and
  embeddings match the model2vec library within 1e-4
  (`conformance/static_embedding_vectors.json` is generated from model2vec
  itself). Also closes the semantic cache's batteries-not-included gap.
- **Signed spend receipts.** Budget attestation proves an agent was
  *authorized* to spend; a receipt is the Ed25519-signed, offline-verifiable
  statement of what it *did* spend — closing grant → spend → proof. Signing
  payloads contain integers and strings only (unix seconds, micro-USD);
  `conformance/spend_receipt_vectors.json` pins payload **and signature**
  byte-for-byte across the 3 SDKs.
- **FOCUS-aligned cost export.** Spend receipts map onto FinOps FOCUS columns
  (tokens ride `ConsumedQuantity`/`ConsumedUnit` per the spec's
  virtual-currency model; RateGuard detail in `x_rateguard_*` extension
  columns). `BilledCost` is deliberately 0 — RateGuard's costs are
  pricing-table **estimates**, never presented as invoice truth.
- **Async webhook emission.** Endpoint-configured event delivery no longer
  runs in the request hot path: bounded queue (default 1024), non-blocking
  emit with drop-and-count on overflow, delivery on a background context (a
  canceled request no longer cancels its own event), drained by
  `SDK.Shutdown` / `runtime.shutdown()` / `rg.shutdown()`.
- **~650 tests** across the 3 SDKs (up from ~498 at v0.2.0): 188 Go test
  functions (`-race`), 226 Node, 237 Python — plus five cross-language
  conformance suites. `mypy --strict` passes clean on all 44 Python source
  files; the Node build is `tsc` strict-clean.

### Published Artifacts

- Go: `github.com/varbees/rateguard/packages/sdk-go@v0.3.0`
- npm: `@varbees/rateguard-node@0.3.0`
- PyPI: `varbees-rateguard==0.3.0` (`pip install varbees-rateguard` — note the
  full name; the bare `rateguard` name on PyPI is an unrelated package)

### Verification

Every feature above carries regression tests confirmed to fail without the
change; cross-language behavior is held by conformance vectors
(`token_bucket`, `budget_attestation_expiry`, `static_embedding`,
`spend_receipt` — signature-level, `realtime_usage` — real captured frames).
Gemini Live parsing was validated against the live API; OpenAI Realtime
against its documented schema with fake-server tests, live check pending.

## v0.2.0 — 2026-07-06

RateGuard `v0.2.0` closes every Node/Python parity gap against the Go reference
implementation. Full changelog below (parts 1-6); see [Highlights](#highlights),
[Published Artifacts](#published-artifacts), and [Verification](#verification).

### Highlights

- **Full Go/Node/Python parity.** Every feature in `AGENTS.md`'s feature inventory
  now ships in all 3 languages except the self-hosted dashboard (Go admin API only,
  untested against Node/Python's new admin APIs). That includes: budget attestation
  (Ed25519 delegation chains), an MCP stdio JSON-RPC server, a Redis-backed
  distributed limiter (atomic Lua GCRA), an opt-in admin HTTP API, the lock-free
  64-way sharded limiter, adaptive (AIMD) rate limiting, pluggable-embedder semantic
  response caching, guardrails/loop-detection/IETF-header middleware wiring, events
  and webhooks, estimate-based budget reservations, and guardrail violation
  tracking with a Prometheus counter.
- **7 MCP tools in all 3 languages** (previously 5 base + 2 Go-only): `attest_budget`
  and `verify_budget` now ship everywhere, and Node/Python gained their own
  zero-dependency stdio JSON-RPC server (`serveMCP`/`serve_mcp`), matching Go's
  `ServeMCP`.
- **Cross-language signature verification bug found and fixed.** Go, Node, and
  Python each formatted a budget token's `expires_at` timestamp differently inside
  the Ed25519 signing payload (Go trims trailing zero fractional digits, Python
  emits fixed microseconds, Node emits fixed milliseconds) — same instant, three
  different signed byte strings, so a token attested in one language would fail to
  verify in another. Fixed by truncating to whole seconds before signing, in all 3
  SDKs, with a new shared conformance oracle
  (`conformance/budget_attestation_expiry_vectors.json`) so it can't silently
  regress. Caught during this release's own verification pass, not by a user.
- **~498 tests** across the 3 SDKs (up from 253 at last count): 151 Go (`-race`),
  162 Node, 185 Python — plus the cross-language conformance suites. `mypy --strict`
  passes clean on all 39 Python source files.
- **Outbound GenAI transport, provider fallback, and SSE usage extraction** shipped
  across all 3 languages in the prior `v0.2.0-dev` cycle (July 4): `WrapClient` /
  `wrapFetch` / `wrap_httpx_client`, 16-host provider detection, per-provider
  circuit breakers, transparent SSE tee usage extraction.
- **Dashboard control center** (`packages/dashboard`) rebuilt on shadcn/ui: six
  sections (Overview, Analytics, Agents, Controls, MCP Console, Settings),
  `docker compose up` demo. Talks to Go's admin API today.

### Published Artifacts

| Runtime | Package | Install |
| --- | --- | --- |
| Go | `github.com/varbees/rateguard/packages/sdk-go` | `go get github.com/varbees/rateguard/packages/sdk-go@v0.2.0` |
| Node.js | `@varbees/rateguard-node` | `npm install @varbees/rateguard-node@0.2.0` |
| Python | `varbees-rateguard` | `pip install varbees-rateguard==0.2.0` |

**Note on the Python package name:** the PyPI distribution name is
`varbees-rateguard` — the bare name `rateguard` on PyPI belongs to an unrelated
package by a different author. `pip install rateguard` will NOT install this SDK.

### Verification

```bash
cd packages/sdk-go
CC=/usr/bin/gcc GOWORK=off go test -race ./...
GOPROXY=proxy.golang.org go list -m github.com/varbees/rateguard/packages/sdk-go@v0.2.0
```

```bash
cd packages/sdk-node
bun run test
npm publish --dry-run --access public
npm view @varbees/rateguard-node version
```

```bash
cd packages/sdk-python
python3 -m pytest -q
python3 -m build --sdist --wheel
python3 -m twine check dist/*
python3 -m pip index versions varbees-rateguard
```

### Known Constraints

- Dashboard (`packages/dashboard`) is verified end-to-end against all 3 languages'
  admin APIs — `docker compose --profile node-demo up` / `--profile python-demo up`,
  same routes and shapes as Go. Two real cross-language bugs surfaced and were
  fixed doing this: Node's `GET/PATCH /admin/policy` was serializing camelCase
  (`requestsPerSecond`) instead of the snake_case wire shape every consumer reads;
  Node's and Python's `list_limits`/`/admin/state` `preset` field was missing 4 of
  its 7 fields (no token budget info at all).
- Go publishing uses the submodule tag form `packages/sdk-go/vX.Y.Z`.
- Python installs from the distribution name `varbees-rateguard`, while the
  import package remains `rateguard` — watch for the name-collision note above.

---

## Unreleased (v0.2.0-dev) — July 6, 2026, part 5 (Node/Python Wave B2 — full parity)

### Budget attestation, MCP stdio server, Redis limiter, admin API — now in all 3 languages
Closed the last 4-feature Go-only gap: Ed25519 delegation-chain budget tokens,
a zero-dep stdio MCP JSON-RPC server (`serveMCP`/`serve_mcp`, driven by each
SDK's existing `mcpTools`/`mcpCall`), an atomic Lua GCRA Redis limiter, and the
opt-in unauthenticated admin HTTP API — all exported from each package's public
entry point and exercised by tests that import only the public surface, not the
internal modules directly (AGENTS.md rule 9).

### Cross-language Ed25519 verification bug: found and fixed
Go's `time.Time` JSON marshaling trims trailing zero fractional digits (0.5s ->
`.5`), Python's `isoformat()` emits fixed 6-digit microseconds, Node's
`toISOString()` emits fixed 3-digit milliseconds — three different byte strings
for the same instant inside the budget token's Ed25519 signing payload. A token
attested in one language would fail to verify in another. Fixed by truncating
`expires_at` to whole seconds before it enters the signing payload, in all 3
SDKs — zero backward-compat cost, since budget attestation was unreleased
everywhere (postdates the Go `v0.1.0` tag; Python sat at unpublished `0.2.0`).
Added `conformance/budget_attestation_expiry_vectors.json` as a shared oracle,
replayed by `TestConformanceBudgetAttestationExpiry` / `conformance.test.ts` /
`test_conformance.py` — same pattern as the existing token-bucket vectors.

### AGENTS.md's feature table was stale on 8 rows beyond this wave's scope
Verification surfaced that estimate-based budget reservations, GenAI TTFT/TPOT,
guardrails/loop-detection/IETF-header middleware wiring, events/webhooks, the
sharded limiter, adaptive rate limiting, semantic caching, and guardrail
violation tracking were all already shipped and exported in Node/Python from
earlier waves but still marked Go-only. Verified each individually (export +
grep for the actual mechanism) before flipping. Dashboard remains the one
legitimately Go-only row.

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
