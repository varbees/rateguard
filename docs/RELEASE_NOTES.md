# Release Notes

## Unreleased (v0.2.0-dev) — July 4, 2026

### GenAI Observability 🆕
- OpenTelemetry `gen_ai.*` semantic conventions (v1.29.0) for Go. Node.js and Python attribute builders included.
- 28-model pricing table at 2026 market rates (OpenAI, Anthropic, Google, Llama, DeepSeek).
- `estimateCost()` across all 3 SDKs. Unknown models return $0.00 — never fabricate costs.
- Streaming chunk telemetry via `RecordStreamChunk()`.
- Budget exhaustion and rate limit hit counters.

### Rate Limiting Algorithm Fix ⚠️
- Fixed Python and Node.js rate limiters: were using sliding window with incorrect `capacity = rps + burst` formula (3x too permissive). Now use identical **Token Bucket** algorithm across all 3 SDKs, matching Go's original implementation.
- Formula: `tokens = min(burst, tokens + elapsed × rps)`, allow if `tokens >= 1.0`.
- All 3 SDKs now document the algorithm inline with RFC citation.

### 3 New Presets 🆕
- `streaming-llm`: 200 RPS, 500K tokens/hr, soft-stop. For real-time LLM streaming workloads.
- `agent-orchestrator`: 500 RPS, 1M tokens/hr, 1B tokens/month. For multi-agent AI systems.
- `mcp-server`: 30 RPS, 50K tokens/hr, hard-stop. For MCP tool servers (low request count, high tool calls).

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
