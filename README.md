# RateGuard

**Flight controls for AI agents — runtime enforcement in Go, Node.js, and Python.**

RateGuard is agent runtime enforcement: token budgets, rate limits, circuit breakers, loop detection, and cryptographically delegable spend authority, running inside your application process. Every token consumed, every limit hit, every breaker trip is an enforced decision *and* a traceable event — with zero infrastructure.

Three SDKs, one architecture: the same core algorithms with idiomatic APIs for each language, held to behavioral parity by shared cross-language conformance vectors.

## Why RateGuard

Rate limiting was invented to protect servers from too many users. In the agent era the dangerous actor is your own software, spending real money at machine speed behind your own credentials — a failure mode with a name ([denial of wallet](https://rateguard.antharmaya.com/denial-of-wallet)) and a documented incident record. Observability explains the bill afterward; gateway caps are coarse and perimeter-bound. Enforcement has to live where the agent runs.

**No proxy. No extra service. No latency overhead.** RateGuard runs inside your application process.

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
| **14 models priced** | Pricing table for GPT-4o/4.1, o3/o4-mini, Claude, Gemini, Llama, and DeepSeek families. Unknown models return `$0.00`; verify provider pages before release. |
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

Every call through the wrapped client is budgeted, breaker-protected per provider, and metered with **real** token usage — including streaming (OpenAI `usage:null` intermediates and Anthropic's split `message_start`/`message_delta` shapes are handled correctly). Go also emits GenAI OTel spans from the outbound wrapper; Node/Python expose the same usage extraction and GenAI attribute/cost helpers for app-level tracing. 16 provider hosts detected out of the box, plus Azure OpenAI, Bedrock, Vertex, and any self-hosted OpenAI-compatible server.

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

## vs the competition

| | RateGuard | express-rate-limit | LiteLLM | Kong |
|---|---|---|---|---|
| Multi-language | ✅ Go+Node+Python | ❌ JS only | ❌ Python only | ❌ |
| Zero infrastructure | ✅ Middleware | ✅ | ❌ Proxy required | ❌ Gateway |
| In-process outbound spend tracking | ✅ Client wrapper | ❌ | ❌ Proxy only | ❌ |
| Agent pre-flight queries (MCP) | ✅ 7 tools + stdio server, all 3 languages | ❌ | ❌ | ❌ |
| Agent loop detection | ✅ Library/MCP; Go middleware | ❌ | ❌ | ❌ |
| LLM token budgets | ✅ | ❌ | ✅ | ❌ |
| GenAI OTel conventions | ✅ | ❌ | ❌ | ❌ |
| Circuit breakers | ✅ | ❌ | ❌ | ❌ |
| Content guardrails | ✅ | ❌ | ✅ | ❌ |
| Provider chain | ✅ | ❌ | ✅ | ❌ |
| Prometheus metrics | ✅ Go endpoint + helpers | ❌ | ❌ | ✅ |
| Open source (MIT) | ✅ | ✅ | ✅ | Partial |

## Docs

- [Framework Integrations](INTEGRATIONS.md) — LangGraph, OpenAI Agents SDK, Vercel AI SDK, Pydantic AI, one line each
- [Architecture](ARCHITECTURE.md) — how RateGuard works, positioning vs Datadog/Kong/Cloudflare
- [Dashboard & admin API](https://rateguard.antharmaya.com/docs/dashboard) — self-hosted control center, `docker compose up` demo, admin API security posture
- [Release Notes](docs/RELEASE_NOTES.md)
- [API Reference](docs/API_REFERENCE.md) — all presets, config options, middleware adapters
- [GenAI Observability](docs/GENAI_OBSERVABILITY.md) — OTel integration, model pricing, span attributes
- [Runnable examples](packages/sdk-go/examples/) — `go run` demos, no API key needed: quickstart, semantic caching, adaptive rate limiting, budget attestation
- Full docs site: [rateguard.antharmaya.com/docs](https://rateguard.antharmaya.com/docs)

## Verification

```bash
cd packages/sdk-go && CC=/usr/bin/gcc GOWORK=off go test ./...
cd packages/sdk-node && bun run test
cd packages/sdk-python && python3 -m pytest -q
```

## License

MIT
