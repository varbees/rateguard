# RateGuard API Reference

## Presets

RateGuard ships with 8 presets covering every 2026 workload. Set once, override per-field.

| Preset | RPS | Burst | Tokens/hr | Tokens/day | Tokens/month | Mode | Use case |
|---|---|---|---|---|---|---|---|
| `dev` | 10 | 20 | 1K | 10K | 100K | hard-stop | Local development |
| `standard` | 100 | 200 | 10K | 100K | 1M | hard-stop | Production APIs |
| `high-throughput` | 1,000 | 2,000 | 100K | 1M | 10M | hard-stop | High-volume services |
| `streaming-llm` 🆕 | 200 | 500 | 500K | 5M | 500M | soft-stop | Real-time LLM streaming |
| `agent-orchestrator` 🆕 | 500 | 1,000 | 1M | 10M | 1B | soft-stop | Multi-agent systems |
| `llm-heavy` | 500 | 1,000 | 250K | 2.5M | 250M | soft-stop | LLM-intensive apps |
| `mcp-server` 🆕 | 30 | 60 | 50K | 500K | 50M | hard-stop | MCP tool servers |
| `strict-upstream-protection` | 50 | 75 | 5K | 20K | 2M | hard-stop | Fragile upstreams |

Aliases: `free`/`dev`, `starter`/`standard`, `pro`/`high-throughput`, `business`/`enterprise`/`llm-heavy`, `streaming`/`streaming-llm`, `agent`/`multi-agent`/`agent-orchestrator`, `mcp`/`mcp-server`.

## Rate Limiting Algorithm

All 3 SDKs use the **Token Bucket** algorithm (RFC standards track, same as Kong/Envoy/AWS):

```
Formula: tokens = min(burst, tokens + elapsed × rps)
Allow:   tokens >= 1.0 → consume 1
Deny:    retry_after = ceil((1.0 - tokens) / rps) × 1000ms
```

## Configuration (Go)

```go
type Config struct {
    Preset               string          // preset name or alias
    RequestsPerSecond    int             // override preset RPS
    Burst                int             // override preset burst
    TokenBudgetPerHour   int64           // override token budget
    TokenBudgetPerDay    int64
    TokenBudgetPerMonth  int64
    TokenBudgetMode      TokenBudgetMode // "hard-stop" or "soft-stop"
    ServiceName          string          // OTel service name
    OTLPCollectorEndpoint string         // OTel collector URL
    RedisClient          *redis.Client   // distributed rate limiting
    CircuitBreaker       CircuitBreakerOptions
    EventEmitter         EventEmitter    // custom event handler
    EventEndpoint        string          // HTTP event webhook
    TenantID             string          // multi-tenant key
    RouteID              string
    UpstreamID           string
    Provider             string          // LLM provider name
    Model                string          // LLM model name
}
```

## Middleware Adapters

### Go
```go
rg := rateguard.New(rateguard.Config{Preset: "standard"})
// net/http
http.Handle("/", rg.HTTPMiddleware(myHandler))
// chi
r := chi.NewRouter()
r.Use(rg.ChiMiddleware())
// Prometheus
http.Handle("/metrics", rg.Metrics())
```

### Node.js
```ts
// Express
app.use(rg.middleware());
// Fastify
fastify.addHook('onRequest', rg.fastifyMiddleware());
// Hono
app.use('*', rg.honoMiddleware());
// Next.js
export const middleware = rg.nextMiddleware();
```

### Python
```python
# FastAPI / Starlette (ASGI)
app.add_middleware(rg.asgi_middleware)
# Flask / Django (WSGI)
app.wsgi_app = rg.wsgi_middleware(app.wsgi_app)
# Decorator
@rg.limit("standard")
async def my_endpoint(request): ...
```

## Provider Chain

```go
chain := rateguard.DefaultProviderChain()
// OpenAI → Anthropic → Google (cost-optimized)

chain = rateguard.BudgetProviderChain()
// Gemini Flash → GPT-4o Mini → Claude Haiku (cheapest first)

chain = rateguard.QualityProviderChain()
// Claude Opus → GPT-4o → Gemini Pro (best quality first)

entry, provider, fallback := chain.Route("openai", CircuitBreakerOpen)
// entry = Anthropic provider, fallback = true
```

## Guardrails

```go
// Standard: PII + injection + 100KB limit
chain := rateguard.StandardGuardrails()

// Strict: PII + injection + 32K token limit + 50KB limit
chain = rateguard.StrictGuardrails()

// Custom
myGuardrail := MyCustomGuardrail{}
chain = rateguard.NewGuardrailChain(
    rateguard.NewPIIGuardrail(),
    rateguard.NewPromptInjectionGuardrail(),
    myGuardrail,
)

if v := chain.Check(prompt); v != nil {
    rateguard.WriteGuardrailReject(w, v) // HTTP 422
}
```

## Events

RateGuard emits events for every request. Subscribe to build custom dashboards, alerts, or audit logs.

```go
type EventEnvelope struct {
    EventID   string
    EventType string // "request.completed", "request.rate_limited", "token_budget.exceeded"
    TenantID  string
    Payload   RequestEventPayload
}

// Send to HTTP endpoint
rg := rateguard.New(rateguard.Config{
    EventEndpoint: "https://my-dashboard.example/api/events",
})

// Custom handler
rg := rateguard.New(rateguard.Config{
    EventEmitter: myCustomEmitter{},
})
```
