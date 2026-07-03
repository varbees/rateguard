# RateGuard — AI Agent Contract

> **Load this file first.** Every agent working on RateGuard must read this before touching code.
> RateGuard is an AI-native rate limiting SDK for Go, Node.js, and Python — middleware, not a proxy.

## Architecture

```
RateGuard is MIDDLEWARE (runs inside your app process)
  NOT a proxy (LiteLLM, Portkey, Helicone)
  NOT a gateway (Kong, Tyk, Apigee)
  NOT a library (express-rate-limit is JS-only)

Three SDKs, identical behavior:
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
| LLM token budgets (hr/day/mo) | ✅ | ✅ | ✅ | `token_budget.go` |
| Circuit breakers | ✅ | ✅ | ✅ | `circuit_breaker.go` |
| GenAI OTel observability | ✅ | ✅ | ✅ | `genai_observability.go` |
| 28-model pricing | ✅ | ✅ | ✅ | Same file |
| Prometheus /metrics | ✅ | ❌ | ❌ | `prometheus.go` |
| Provider chain | ✅ | ✅ | ✅ | `provider_chain.go` |
| Content guardrails (PII, injection) | ✅ | ✅ | ✅ | `guardrails.go` |
| 8 presets | ✅ | ✅ | ❌ (config only) | `presets.go` |
| Redis distributed limiter | ✅ | ❌ | ❌ | `redis_limiter.go` |
| Events/webhooks | ✅ | — | — | `events.go` |

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
  "strict-upstream-protect": {"rps": 50,  "burst": 75,   "tokens_hr": "5K"}
}
```

## Commands (copy-paste ready)

```bash
# Go tests
cd packages/sdk-go && CC=/usr/bin/gcc GOWORK=off go test ./...

# Node tests
cd packages/sdk-node && bun run test

# Python tests
cd packages/sdk-python && python3 -m pytest -q

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
6. **Keep it SDK-only.** No gateway, dashboard, proxy, billing, marketplace code on `main`. The legacy full-stack product is on `legacy/full-stack`.
7. **Verify formulas.** Every formula must cite its source (RFC, Wikipedia, academic paper). No hand-waving.
8. **Model pricing must be verifiable.** Every price in the pricing table must be checkable against the provider's public pricing page as of the commit date.

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
