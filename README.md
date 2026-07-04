# RateGuard Middleware

**The AI-native rate limiting SDK for Go, Node.js, and Python.**

RateGuard is middleware that makes every LLM call transparent. Drop it into your app and every token consumed, every rate limit hit, every circuit breaker trip becomes a traceable event — with zero infrastructure.

Three SDKs, identical behavior, one API.

## Why RateGuard

Every other rate limiting tool was built for REST APIs. RateGuard was built for the LLM era — where a single request can consume 100,000 tokens, streaming responses span minutes, and your provider bill depends on how well you control it.

**No proxy. No extra service. No latency overhead.** RateGuard runs inside your application process.

## What it does

| Capability | What it means |
|---|---|
| **Outbound spend tracking** | Wrap the HTTP client your LLM SDK already uses (`http.Client`/`fetch`/`httpx`). Real token usage from every provider response — JSON and SSE streaming — metered into budgets. |
| **Provider fallback** | Automatic failover across OpenAI-compatible providers (DeepSeek, Groq, Cerebras, vLLM, ...) on 429/5xx/breaker-open, with credential isolation. Honest scope: cross-schema fallback is impossible at the transport layer and not claimed. |
| **Rate limiting** | Token bucket algorithm (RFC standard). Configurable per-tenant, per-route, per-provider. |
| **Pre-flight queries** | `Peek` semantics everywhere: agents ask "can I make this call?" without consuming budget. |
| **MCP server** | 5 MCP tools + zero-dependency stdio server (Go). Any MCP client — Claude Code, Cursor, custom agents — can query limits before calling. |
| **Loop detection** | SHA-256 payload fingerprinting halts runaway agent loops. Wired into middleware via `X-Sequence-Depth`. |
| **Token budgets** | Hourly, daily, monthly limits on LLM token consumption. Hard-stop or soft-stop (queue). Estimate-based reservations keep concurrency high. |
| **Circuit breakers** | Per-provider on outbound, per-upstream on inbound. Closed → Open → Half-Open state machine. |
| **GenAI observability** | OpenTelemetry `gen_ai.*` spans per semconv: `{operation} {model}` span names, input/output token attributes, low-cardinality `error.type`. |
| **Content guardrails** | PII detection, prompt injection detection, token/length limits. Wired into middleware — violations return 422. |
| **Prometheus metrics** | `/metrics` endpoint with live request/rate-limit/budget/breaker/loop/outbound counters. Zero deps. |
| **Streaming-aware** | SSE bytes pass through untouched while usage, TTFT, and TPOT are extracted on the side. Bounded memory, always. |
| **14 models priced** | Verified against provider pricing pages. GPT-4o, o3, Claude Opus 4.5, Gemini 2.5, Llama, DeepSeek. Auto cost estimation. |

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

Every call through the wrapped client is budgeted, breaker-protected per provider, and metered with **real** token usage — including streaming (OpenAI `usage:null` intermediates and Anthropic's split `message_start`/`message_delta` shapes are handled correctly). 16 provider hosts detected out of the box, plus Azure OpenAI, Bedrock, Vertex, and any self-hosted OpenAI-compatible server.

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

```jsonc
// Claude Code / Claude Desktop / Cursor config
{ "mcpServers": { "rateguard": { "command": "your-app", "args": ["mcp"] } } }
```

Five tools, identical across Go/Node/Python: `get_rate_limit_state`, `get_token_budget`, `get_circuit_breaker_state`, `check_loop`, `list_limits`.

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

## vs the competition

| | RateGuard | express-rate-limit | LiteLLM | Kong |
|---|---|---|---|---|
| Multi-language | ✅ Go+Node+Python | ❌ JS only | ❌ Python only | ❌ |
| Zero infrastructure | ✅ Middleware | ✅ | ❌ Proxy required | ❌ Gateway |
| In-process outbound spend tracking | ✅ Client wrapper | ❌ | ❌ Proxy only | ❌ |
| Agent pre-flight queries (MCP) | ✅ 5 tools + stdio server | ❌ | ❌ | ❌ |
| Agent loop detection | ✅ | ❌ | ❌ | ❌ |
| LLM token budgets | ✅ | ❌ | ✅ | ❌ |
| GenAI OTel conventions | ✅ | ❌ | ❌ | ❌ |
| Circuit breakers | ✅ | ❌ | ❌ | ❌ |
| Content guardrails | ✅ | ❌ | ✅ | ❌ |
| Provider chain | ✅ | ❌ | ✅ | ❌ |
| Prometheus metrics | ✅ | ❌ | ❌ | ✅ |
| Open source (MIT) | ✅ | ✅ | ✅ | Partial |

## Docs

- [Framework Integrations](INTEGRATIONS.md) — LangGraph, OpenAI Agents SDK, Vercel AI SDK, Pydantic AI, one line each
- [Architecture](ARCHITECTURE.md) — how RateGuard works, positioning vs Datadog/Kong/Cloudflare
- [Release Notes](docs/RELEASE_NOTES.md)
- [API Reference](docs/API_REFERENCE.md) — all presets, config options, middleware adapters
- [GenAI Observability](docs/GENAI_OBSERVABILITY.md) — OTel integration, model pricing, span attributes

## Verification

```bash
cd packages/sdk-go && CC=/usr/bin/gcc GOWORK=off go test ./...
cd packages/sdk-node && bun run test
cd packages/sdk-python && python3 -m pytest -q
```

## License

MIT
