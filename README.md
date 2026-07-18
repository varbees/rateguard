# RateGuard

[![CI](https://github.com/varbees/rateguard/actions/workflows/ci.yml/badge.svg)](https://github.com/varbees/rateguard/actions/workflows/ci.yml)
[![Go Reference](https://pkg.go.dev/badge/github.com/varbees/rateguard/packages/sdk-go.svg)](https://pkg.go.dev/github.com/varbees/rateguard/packages/sdk-go)
[![npm](https://img.shields.io/npm/v/@varbees/rateguard-node)](https://www.npmjs.com/package/@varbees/rateguard-node)
[![PyPI](https://img.shields.io/pypi/v/varbees-rateguard)](https://pypi.org/project/varbees-rateguard/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Flight controls for AI agents. Runtime enforcement in Go, Node.js, and Python.**

An agent holds your API key and no sense of when to stop. RateGuard enforces token budgets, kills runaway loops, and trips breakers on failing providers, all from inside your process. Go, Node, Python. No proxy, no gateway, no network hop — [tens of microseconds](#overhead), not the milliseconds a gateway costs.

One unsupervised agent scanning a hobbyist network ran up a $6,531 cloud bill overnight. Two agents in a research pipeline passed work back and forth for eleven days before a billing alert caught it. The failure mode has a name now, [denial of wallet](https://rateguard.antharmaya.com/denial-of-wallet), with a sourced incident record.

```go
// One line. Every OpenAI/Anthropic/Google call is now budgeted, metered, and breaker-protected.
client := rg.WrapClient(&http.Client{})
```

Every token consumed, every limit hit, every breaker trip is an enforced decision and a traceable event, with zero infrastructure. Three SDKs, one architecture: the same core algorithms with idiomatic APIs for each language, held to behavioral parity by shared cross-language conformance vectors.

**Watch a runaway agent get halted** (real wrapped client, local fake provider, no API key, ~20 seconds):

<!-- demo GIF drops in here: packages/sdk-go/examples/runaway-demo/runaway.gif -->

```bash
go run ./examples/runaway-demo    # from packages/sdk-go: a budget burns down, then RateGuard stops the loop
```

## Why RateGuard

Rate limiting was invented to protect servers from too many users. In the agent era the dangerous actor is your own software, spending real money at machine speed behind your own credentials. Observability explains the bill afterward. A gateway cap is coarse and sits at the perimeter. Enforcement has to live where the agent runs.

**No proxy. No extra service. No network hop.** RateGuard runs inside your application process.

Not "no overhead" — every line of code costs something, and a claim you cannot show a number for
is not a claim. Here is the number: **~26µs and ~7KB per admission decision**, against the **1–30ms
network round trip** a gateway hop adds. Three orders of magnitude, measured, reproducible —
see [Overhead](#overhead).

## What it does

| Capability | What it means |
|---|---|
| **Outbound spend tracking** | Wrap the HTTP client your LLM SDK already uses (`http.Client`/`fetch`/`httpx`). Real token usage from every provider response — JSON and SSE streaming — metered into budgets. |
| **Provider fallback** | Automatic failover across OpenAI-compatible providers (DeepSeek, Groq, Cerebras, vLLM, ...) on 429/5xx/breaker-open, with credential isolation. Honest scope: cross-schema fallback is impossible at the transport layer and not claimed. |
| **Rate limiting** | Token bucket algorithm (RFC standard). Configurable per-tenant, per-route, per-provider. |
| **Pre-flight queries** | `Peek` semantics everywhere: agents ask "can I make this call?" without consuming budget. |
| **MCP tools** | 7 tools, identical across Go/Node/Python (`attest_budget`/`verify_budget` included). Each SDK also ships a zero-dependency stdio JSON-RPC server (`ServeMCP`/`serveMCP`/`serve_mcp`). |
| **Loop detection** | SHA-256 payload fingerprinting halts runaway agent loops. The primitive ships in all SDKs; middleware in all 3 languages can enforce it via `X-Sequence-Depth`. |
| **Token budgets** | Hourly, daily, monthly limits on LLM token consumption. Hard-stop or soft-stop (queue). Estimate-based reservations keep concurrency high — all 3 languages. |
| **Circuit breakers** | Per-provider on outbound, per-upstream on inbound. Closed → Open → Half-Open state machine. |
| **GenAI observability** | OpenTelemetry `gen_ai.*` spans per semconv in all 3 languages, including TTFT/TPOT timing. |
| **Content guardrails** | PII detection, prompt injection detection, token/length limits. Middleware in all 3 languages can reject violations with 422; guardrail violations are tracked in a bounded log with a Prometheus counter. |
| **Prometheus metrics** | Go `/metrics` endpoint with live counters; Node/Python expose zero-dependency exposition helpers. |
| **Streaming-aware** | SSE bytes pass through untouched while usage, TTFT, and TPOT are extracted on the side. Bounded memory, always. |
| **Cost estimates, your prices** | A starter table prices common models (GPT-4o/4.1, o3/o4-mini, Claude, Gemini, Llama, DeepSeek); dated snapshots (`gpt-4o-2024-08-06`) resolve to their base entry. Bring a `PricingProvider`/`StaticPricing` map to price custom, fine-tuned, or unlisted models — no fetched file, no network. Unknown everywhere → `$0.00` (never fabricated; cost is a display estimate, never enforcement). |
| **Per-customer attribution** | Send an `X-RateGuard-Customer` header and budgets scope per end-user — one runaway customer can't exhaust the tenant's budget, and spend is tracked per customer. The header is stripped before the provider sees it. All 3 languages. |
| **Adaptive rate limiting** | Opt-in AIMD controller auto-tunes the effective limit from observed upstream error rate — grows on healthy traffic, cuts before the circuit breaker has to trip. All 3 languages. |
| **Semantic caching** | Bring your own `Embedder` (OpenAI/Cohere/Voyage embeddings — anything), or use the built-in static embedder below. A cosine-similarity hit skips the network call, breaker, and budget entirely. Streaming requests always bypass it. All 3 languages. |
| **Static embedder** | Local embeddings with zero inference dependencies: load a converted model2vec/potion model (~8MB file, downloaded — never bundled) and get WordPiece + mean-pool + normalize in pure stdlib. Token-id-exact with the reference HF tokenizer, conformance-tested across all 3 languages against output from the model2vec library itself. |
| **Semantic loop detection** | Catches the loop SHA-256 can't: agents repeating the same step in different words (the documented $47K two-agent incident shape). Local embeddings + cosine window, threshold empirically calibrated (0.90) to stay silent on same-template/different-entity workloads. Public primitive with `Check`/`Peek` (pre-flight never records). All 3 languages. |
| **Budget attestation** | Ed25519-signed delegation chains so one agent can hand a sub-agent a cryptographic budget that only narrows, never widens — no shared secret, verifiable end-to-end, byte-identical signing across all 3 languages. RateGuard's own extension in the shape of the IETF Agent Identity Protocol draft, not a claim of AIP compliance. |
| **Spend receipts** | Ed25519-signed, offline-verifiable proof of what a key actually spent — tokens, integer micro-USD estimate, window, optional binding to the attestation that authorized it. Closes grant → spend → proof. Signature-level conformance vectors across all 3 languages. |
| **FOCUS cost export** | Spend receipts → FinOps FOCUS columns (tokens via ConsumedQuantity/ConsumedUnit; x_rateguard_* extensions). BilledCost is always 0 — costs are pricing-table estimates, never invoice truth. |
| **Realtime voice sessions** | Session budgets for OpenAI Realtime and Gemini Live: total/audio tokens, turns, wall-clock duration, caller-priced cost — enforced mid-session with a once-only breach callback. Gemini schema live-verified; Pipecat + LiveKit Agents adapters (Python). |
| **Async webhooks** | Endpoint-configured event delivery runs off the hot path: bounded queue, non-blocking emit, drop-with-counter on overflow, drained on shutdown. |
| **Redis distributed limiter** | Atomic Lua GCRA script, byte-identical across all 3 languages — for rate limits shared across multiple processes/instances. |
| **Admin API** | Opt-in, unauthenticated-by-design HTTP API for state/policy/MCP-tool-calls — bind privately. CORS is same-origin-only by default; cross-origin access (e.g. a dashboard on a different port) requires explicitly configuring the allowed origin, never a wildcard. All 3 languages. |

## Guard the money, not just the door

Inbound middleware protects your API. But real LLM spend happens on **outbound** calls — and RateGuard rides the HTTP client your LLM SDK already uses. Not a proxy. Not a new service. No YAML, no Redis, no new attack surface.

```go
// Go — one line
client := rg.WrapClient(&http.Client{})
openai := openai.NewClient(option.WithHTTPClient(client))
```

```ts
// Node — one line
const client = new OpenAI({ fetch: rg.wrapFetch() });
```

```python
# Python — one line (OpenAI + Anthropic SDKs run on httpx)
client = OpenAI(http_client=rg.wrap_httpx_client())
```

Every call through the wrapped client is budgeted, breaker-protected per provider, and metered with **real** token usage — including streaming (OpenAI `usage:null` intermediates and Anthropic's split `message_start`/`message_delta` shapes are handled correctly). Go also emits GenAI OTel spans from the outbound wrapper; Node/Python expose the same usage extraction and GenAI attribute/cost helpers for app-level tracing. 26 hosts across 23 OpenAI-compatible providers detected out of the box, plus Anthropic, Gemini, Vertex, Azure OpenAI, and AWS Bedrock (28 providers total) — and any self-hosted OpenAI-compatible server.

## Quick Start

### Go
```go
import rateguard "github.com/varbees/rateguard/packages/sdk-go"

rg := rateguard.New(rateguard.Config{Preset: "streaming-llm"})
http.Handle("/metrics", rg.Metrics())
```

### Node.js
```ts
import { RateGuard } from '@varbees/rateguard-node';

const rg = new RateGuard({ preset: 'streaming-llm' });
app.use(rg.middleware());
```

### Python
```python
from rateguard import RateGuard

rg = RateGuard(preset="streaming-llm")
app.add_middleware(rg.asgi_middleware)
```

## Presets (8)

| Preset | Use case | RPS | Tokens/hr |
|---|---|---|---|
| `dev` | Local development | 10 | 1K |
| `standard` | Production API | 100 | 10K |
| `high-throughput` | High-volume services | 1,000 | 100K |
| `streaming-llm` 🆕 | Real-time LLM streaming | 200 | 500K |
| `agent-orchestrator` 🆕 | Multi-agent systems | 500 | 1M |
| `llm-heavy` | LLM-intensive apps | 500 | 250K |
| `mcp-server` 🆕 | MCP tool servers | 30 | 50K |
| `strict-upstream-protection` | Fragile upstreams | 50 | 5K |

## Agents: ask before you call

Every AI gateway makes agents discover limits by hitting 429s. RateGuard answers **before the request leaves the process** — and pre-flight queries never consume budget.

```go
// Expose RateGuard as an MCP server (stdlib-only, newline-delimited JSON-RPC)
rg := rateguard.New(rateguard.Config{Preset: "agent-orchestrator"})
_ = rg.ServeMCP(ctx, os.Stdin, os.Stdout)
```

```ts
// Node — same stdio server
const rg = new RateGuard({ preset: 'agent-orchestrator' });
await serveMCP(rg);
```

```python
# Python — same stdio server
rg = RateGuard(preset="agent-orchestrator")
await serve_mcp(rg)
```

```jsonc
// Claude Code / Claude Desktop / Cursor config
{ "mcpServers": { "rateguard": { "command": "your-app", "args": ["mcp"] } } }
```

Seven tools, identical across Go/Node/Python: `get_rate_limit_state`, `get_token_budget`, `get_circuit_breaker_state`, `check_loop`, `list_limits`, `attest_budget`, `verify_budget` — the last two for cryptographic budget delegation between agents, see [Budget Attestation](docs/API_REFERENCE.md#budget-attestation).

```go
// Track any LLM call with OTel GenAI spans + automatic cost estimation
ctx, span := rg.StartGenAICall(ctx, rateguard.GenAICall{Provider: "openai", Model: "gpt-4o"})
resp, err := client.Chat(ctx, req)
span.End(rateguard.GenAICall{PromptTokens: in, CompletionTokens: out}, err)
```

## Packages

| Language | Package | Install |
|---|---|---|
| Go | `github.com/varbees/rateguard/packages/sdk-go` | `go get` |
| Node.js | `@varbees/rateguard-node` | `npm install` |
| Python | `varbees-rateguard` | `pip install` |
| Dashboard | `packages/dashboard` — self-hosted control center | `docker compose up` |

## How it compares

The honest comparison is about **where enforcement lives**, not who has the longer feature
list. LiteLLM and Kong AI Gateway both ship token-aware LLM rate limiting today — the difference
is architectural: they are a service you deploy in front of your app, RateGuard is a library that
runs inside it.

| | RateGuard | express-rate-limit | LiteLLM | Kong AI Gateway |
|---|---|---|---|---|
| Shape | In-process library | In-process library | Proxy you deploy | Gateway you operate |
| Embeddable in | Go · Node · Python | Node only | Python¹ | — |
| Meters outbound LLM spend inside your process | ✅ | ❌ | at the proxy hop | at the gateway hop |
| Agent queries its own limit pre-flight (MCP, no 429) | ✅ 7 tools | ❌ | ❌ | ❌ |
| Cryptographic budget delegation (Ed25519) | ✅ | ❌ | ❌ | ❌ |
| API keys never leave your app | ✅ | n/a | ❌ terminate at proxy | ❌ terminate at gateway |
| Open source | MIT | MIT | MIT | OSS core + Enterprise |

¹ LiteLLM's proxy is callable over HTTP from any language; its embeddable SDK is Python.
RateGuard's durable claim is the architecture — in your process, no hop, keys never leave — plus
budget delegation you can verify with a signature, not a longer list of checkmarks.

## Docs

- [Framework Integrations](INTEGRATIONS.md) — LangGraph, OpenAI Agents SDK, Vercel AI SDK, Pydantic AI, one line each
- [Architecture](ARCHITECTURE.md) — how RateGuard works, positioning vs Datadog/Kong/Cloudflare
- [Dashboard & admin API](https://rateguard.antharmaya.com/docs/dashboard) — self-hosted control center, `docker compose up` demo, admin API security posture
- [Release Notes](docs/RELEASE_NOTES.md)
- [API Reference](docs/API_REFERENCE.md) — all presets, config options, middleware adapters
- [GenAI Observability](docs/GENAI_OBSERVABILITY.md) — OTel integration, model pricing, span attributes
- [Runnable examples](packages/sdk-go/examples/) — `go run` demos, no API key needed: quickstart, semantic caching, adaptive rate limiting, budget attestation
- Full docs site: [rateguard.antharmaya.com/docs](https://rateguard.antharmaya.com/docs)

## Overhead

Measured, not asserted. Reproduce with:

```bash
cd packages/sdk-go && go test -bench=Overhead -benchmem -run='^$' ./...
```

Go SDK, `linux/amd64`, Intel i5-9300H @ 2.40GHz (a laptop, 2026-07-17). **Ranges, not points** —
across `-count=6` the admission decision swung 26–37µs on this machine. Anyone quoting one decimal
place off hardware like this is quoting the run that flattered them.

| Path | Time (range) | Allocated |
|---|---|---|
| Admission decision (inbound middleware) | **~26–37µs** | ~7 KB |
| Admission, under parallel load | **~5–7µs** | ~7 KB |
| Outbound call — unwrapped baseline (loopback) | ~190–220µs | ~6.7 KB |
| Outbound call — wrapped | ~510–570µs | ~17 KB |
| **→ RateGuard's share of an outbound call** | **~320–350µs** | ~+10 KB |
| — of which, measuring the request estimate | ~80–100µs | skippable via `EstimatedTokens` |
| Token estimation (`EstimateTokens`), 200 chars | **~1µs** | **0 B** (188 MB/s) |
| Request estimation, 100K-char context | ~2.3ms | ~214 KB (44 MB/s) |

**Read these honestly:**

- **The comparison that matters is the hop we replace, not zero.** A gateway adds a network round
  trip: 1–30ms. Admission costs tens of microseconds. That is 2–3 orders of magnitude, and it is
  why the claim above is "no network hop" rather than "no overhead."
- **Against the call it guards, it disappears.** An LLM request takes 500ms–30s. ~350µs on that is
  **well under 0.1%**. Even the worst case here — 2.3ms to measure a 100K-token context — is ~0.01%
  of the 5–30s call that context implies.
- **Most of the admission cost is instrumentation, not enforcement**: OpenTelemetry metrics
  recording, response-header writing, and the GC pressure they create. The limiter and budget
  arithmetic are a small fraction. (Profiling this is what found `35384e9`, where the SDK was
  recording spans nobody was exporting.)
- **`EstimatedTokens` buys back ~80–100µs** by pinning the reservation instead of measuring it —
  at the cost of the overshoot protection measuring provides. Measuring is the right default; the
  escape hatch exists and is documented.
- **This is one noisy laptop on loopback.** Yours will differ. The command is above — run it rather
  than trusting the table.

## Verification

```bash
cd packages/sdk-go && CC=/usr/bin/gcc GOWORK=off go test ./...
cd packages/sdk-node && bun run test
cd packages/sdk-python && python3 -m pytest -q
```

800+ tests. That number tells you almost nothing, so here are the two that do.

### Would the tests notice if the code lied?

```bash
python3 scripts/mutate.py     # ~50s, all three SDKs
```

Coverage measures whether a line *ran*. It cannot measure whether a test would **notice the line
being wrong** — and those are different questions. This repo learned that the expensive way: ~800
green tests failed to notice that two SDKs metered **zero tokens** for the most common streaming
shape in the ecosystem.

So the number we publish is the **mutation score**: inject a defect into the money paths, run the
suite, and see whether anything screams.

| SDK | Mutation score |
|---|---|
| Go | **100%** (8/8) |
| Node | **100%** (4/4) |
| Python | **100%** (5/5) |

Every mutation reproduces a defect this codebase **actually shipped** or deliberately rejected —
MAX→SUM (Groq bills 3x), measured→constant (25x under-reserve), estimate→zero (the
denial-of-wallet hole), CJK chars/4, rule 5's peek→record. A suite seeded with your own bug
history asks the only question worth asking: *if we regressed to the bug we already had, would
anyone notice?*

**Read it honestly:** 100% here means "the 17 defects we know about, we detect." It does **not**
mean bug-free. The catalogue is hand-picked and small by design — that is what makes a 100% gate
defensible instead of a spray of equivalent mutants nobody triages.

### Does it survive real providers?

The suites above prove RateGuard is *self-consistent*. They cannot prove it is *true* — every test
inherits the same assumptions about what providers send. So we also run it against real providers:

```bash
export NVIDIA_NIM_API_KEY=... GROQ_API_KEY=... DEEPSEEK_API_KEY=...
scripts/live-matrix.sh
```

**Live provider matrix — last run 2026-07-17:**

| Provider | Model | Result |
|---|---|---|
| NVIDIA NIM | `meta/llama-3.1-8b-instruct` | ✅ pass |
| Groq | `llama-3.3-70b-versatile` | ✅ pass |
| DeepSeek | `deepseek-chat` | ✅ pass |

Each asserts the whole chain against a live API: real usage extracted from real SSE, the budget
**actually charged** the number the provider reported, a real budget **blocking** a real runaway,
freeze halting live calls, and usage flowing into a verifiable evidence chain.

Their real bytes are frozen into `conformance/sse_usage_vectors.json`, so every future run replays
them offline — no key, no network. That is where the interesting cases live:

- **Groq emits the same usage three times** per call (top-level `usage`, a nested `x_groq.usage`
  with identical numbers, then top-level `usage` again). A summing extractor bills **150 tokens for
  a 50-token call**. MAX-per-field is what makes it correct.
- **DeepSeek** adds `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`; **NIM** sends a null
  `audio_tokens`. Extraction must ignore what it doesn't understand rather than choke.

**Known gap, stated plainly:** the denial-of-wallet path — a stream carrying *no* usage at all,
where RateGuard must charge its reserved estimate rather than zero — is covered by conformance
vectors and unit tests but **not live**. NVIDIA NIM, Groq and DeepSeek all emit usage even without
`stream_options.include_usage`, so all three skip that test. OpenAI omits it and would close the
gap. A green matrix above does not cover this.

## Signed releases

Every release is Sigstore-signed — npm provenance, PyPI attestations, and a cosign-signed SBOM on
the GitHub Release, all keyless (Fulcio + Rekor, no held key). A tool that ships cryptographic
spend evidence should ship signed artifacts, and verifying is one command:

```bash
npm audit signatures                    # npm provenance
cosign verify-blob --bundle <sbom>.sigstore.json \
  --certificate-identity-regexp 'https://github.com/varbees/rateguard/.github/workflows/release.yml@.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' <sbom>
```

Full trust model and why keyless matches RateGuard's own evidence thesis: [SIGNING.md](SIGNING.md).

## License

MIT
