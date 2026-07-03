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
| **Rate limiting** | Token bucket algorithm (RFC standard). Configurable per-tenant, per-route, per-provider. |
| **Token budgets** | Hourly, daily, monthly limits on LLM token consumption. Hard-stop or soft-stop (queue). |
| **Circuit breakers** | Automatic upstream protection. Closed → Open → Half-Open state machine. |
| **GenAI observability** | OpenTelemetry `gen_ai.*` spans for every LLM call. Tokens, model, cost, latency. |
| **Provider chain** | Auto-fallback when circuit breaker trips. OpenAI → Anthropic → Google, transparently. |
| **Content guardrails** | PII detection, prompt injection detection, token/length limits. Pluggable. |
| **Prometheus metrics** | `/metrics` endpoint with rate limits, token budgets, circuit breaker state. Zero deps. |
| **Streaming-aware** | Tracks SSE chunks for streaming LLM calls. Chunk counting, token estimation. |
| **28 models priced** | 2026 market rates for GPT-4o, Claude Opus, Gemini, Llama, DeepSeek. Auto cost estimation. |

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
| LLM token budgets | ✅ | ❌ | ✅ | ❌ |
| GenAI OTel conventions | ✅ | ❌ | ❌ | ❌ |
| Circuit breakers | ✅ | ❌ | ❌ | ❌ |
| Content guardrails | ✅ | ❌ | ✅ | ❌ |
| Provider chain | ✅ | ❌ | ✅ | ❌ |
| Prometheus metrics | ✅ | ❌ | ❌ | ✅ |
| Open source (MIT) | ✅ | ✅ | ✅ | Partial |

## Docs

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
