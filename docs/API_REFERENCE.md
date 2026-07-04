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

    EstimatedTokensPerRequest int64      // bound hard-stop budget reservations (0 = reserve all remaining)
    Guardrails           *GuardrailChain // check request bodies, violations → 422
    LoopDetection        bool            // agent loop detection via X-Sequence-Depth header
    LoopMaxDepth         int             // max agent sequence depth (default 50)
    MaxBufferedResponseBytes int         // cap response buffering for token extraction (default 1 MiB)

    AdaptiveRateLimit    bool            // opt-in AIMD auto-tuning (Go) — see Adaptive Rate Limiting
    Adaptive             AdaptiveOptions // controller tuning; zero value = documented defaults
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
await rg.fastify()(fastify);
// Hono
app.use('*', rg.hono());
// Next.js route handler
export const POST = rg.withRateGuard(async (request) => Response.json({ ok: true }));
```

### Python
```python
# FastAPI / Starlette (ASGI)
app.add_middleware(rg.asgi_middleware)
# Flask / Django (WSGI)
app.wsgi_app = rg.wsgi_middleware(app.wsgi_app)
# Decorator
from rateguard import rate_limited

@rate_limited(preset="standard")
async def my_endpoint(request): ...
```

## Outbound GenAI Transport

Wrap the HTTP client your LLM SDK already uses. Every LLM call is budgeted, breaker-protected per provider, and metered with real token usage (JSON and SSE streaming).

### Go
```go
rg := rateguard.New(rateguard.Config{Preset: "llm-heavy", TokenBudgetPerHour: 1_000_000})
client := rg.WrapClient(&http.Client{})                  // or rg.Transport(next, opts)
openai := openai.NewClient(option.WithHTTPClient(client))

// With fallback across OpenAI-compatible providers:
client = rg.WrapClient(nil, rateguard.OutboundOptions{
    Chain: rateguard.NewProviderChain(
        rateguard.Provider("openai", "gpt-4o", "https://api.openai.com/v1"),
        rateguard.ProviderEntry{Name: "deepseek", Model: "deepseek-chat",
            BaseURL: "https://api.deepseek.com/v1",
            Headers: map[string]string{"Authorization": "Bearer " + deepseekKey}},
    ),
})
```

### Node
```ts
const rg = new RateGuard({ preset: 'llm-heavy' });
const client = new OpenAI({ fetch: rg.wrapFetch() });
// Options: { mode: 'enforce' | 'observe', chain: ProviderEntry[], fetch }
```

### Python
```python
rg = RateGuard(preset="llm-heavy")
client = OpenAI(http_client=rg.wrap_httpx_client())   # httpx imported lazily
# Advanced: create_httpx_transport(rg.runtime, mode="observe", chain=[FallbackProvider(...)])
```

Semantics:
- **enforce** (default): exhausted budgets / open breakers synthesize provider-native 429/503 responses with `Retry-After` and `X-RateGuard-Synthesized: true` — your SDK's retry logic handles them natively. **observe**: never blocks, only meters.
- Budget scope: `{tenant}:{provider}:{model}:outbound`, reserve → commit actual usage. Calls pass while any budget remains; the final call may overshoot (actual usage is only known post-response), then everything blocks until the window rolls.
- Fallback: OpenAI-compatible endpoints only (same request schema). Credentials never transfer across providers; chain entries follow the OpenAI-SDK convention (baseURL owns the version prefix). Retargeted responses carry `X-RateGuard-Fallback: true`.
- Streaming: SSE bytes pass through untouched; usage extracted from a bounded side-scan (OpenAI `usage:null` intermediates and Anthropic split usage handled).

## Semantic Caching (Go)

Cache LLM responses by meaning, not exact text — a prompt that means the same thing as one already
answered can skip the network call, the circuit breaker, and the token budget entirely.

RateGuard does not bundle an embedding model — that would mean shipping (or requiring) an ONNX
runtime, a hosted embeddings dependency, or a Python sidecar, exactly the kind of infrastructure
RateGuard's "zero infrastructure, zero added attack surface" positioning exists to avoid. Instead,
`Embedder` is a one-method interface: bring the OpenAI/Cohere/Voyage embeddings API, a local
sentence-transformer binding, or anything else that turns text into a vector.

```go
type Embedder interface {
    Embed(ctx context.Context, text string) ([]float32, error)
}

client := rg.WrapClient(&http.Client{}, rateguard.OutboundOptions{
    SemanticCache: &rateguard.SemanticCacheOptions{
        Embedder:            myEmbedder,       // required — no default
        SimilarityThreshold: 0.92,             // default 0.92
        TTL:                 time.Hour,        // default 1h
        MaxEntriesPerScope:  500,              // default 500, oldest-first eviction
    },
})
```

Semantics:
- Scoped per `{provider}:{model}` — a cache entry for `openai:gpt-4o` never serves a
  `anthropic:claude-opus-4-5` request, even with an identical prompt.
- A hit is marked with `X-RateGuard-Cache: hit` on the response so callers and observability can
  tell it apart from a live call.
- **Streaming requests are never cached** (`"stream": true` in the body bypasses the cache
  entirely, both lookup and store) — replaying a cached body as a fabricated SSE stream would
  misrepresent TTFT/TPOT to the caller.
- Only successful (HTTP 200), non-synthesized responses are stored — a provider error or a
  RateGuard-synthesized 429/503 rejection is never cached.
- An `Embedder` error degrades to a real call; caching is a cost optimization, never a reason to
  fail a request.
- Prompt extraction understands OpenAI- and Anthropic-shaped chat bodies (`messages[].content` as
  a string or as typed parts, plus Anthropic's top-level `system` field); non-text parts
  (images, audio) are ignored for embedding purposes.

## Adaptive Rate Limiting (Go)

Static rate limits are a guess. `AdaptiveLimiter` wraps the configured limiter and auto-tunes the
effective policy from the same success/failure signal the circuit breaker already observes — an
AIMD controller (the same shape TCP congestion control uses): additive growth on healthy traffic,
multiplicative cut once the error-rate EMA crosses 80% of the target, so the limiter sheds load
*before* the breaker has to trip.

```go
rg := rateguard.New(rateguard.Config{
    Preset:            "llm-heavy",
    AdaptiveRateLimit: true,
    Adaptive: rateguard.AdaptiveOptions{
        TargetErrorRate: 0.05, // default
        MinFactor:       0.25, // floor: 25% of configured policy
        MaxFactor:       2.0,  // ceiling: 200% of configured policy
    },
})
```

The configured policy (preset or explicit RPS/burst) is always the anchor — the controller scales
it within `[MinFactor, MaxFactor]`, never replaces it. `Peek` scales identically to `Allow`, so
agent pre-flight answers stay honest while the limit is being adjusted.

## MCP Tools (agent pre-flight)

Five tools, identical across Go/Node/Python. All use **peek semantics** — querying never consumes budget.

| Tool | What it answers |
|---|---|
| `get_rate_limit_state` | Would a call for this key be allowed right now? Remaining, limit, retry-after. |
| `get_token_budget` | How many LLM tokens remain? Optionally: would `estimated_tokens` fit? |
| `get_circuit_breaker_state` | Is the upstream healthy? closed / open / half-open. |
| `check_loop` | Has this exact payload been seen at a lower sequence depth (runaway loop)? |
| `list_limits` | Everything above in one call, for agent initialization. |

### Go — serve over MCP stdio (zero dependencies)
```go
rg := rateguard.New(rateguard.Config{Preset: "agent-orchestrator"})
_ = rg.ServeMCP(ctx, os.Stdin, os.Stdout) // JSON-RPC 2.0: initialize, tools/list, tools/call, ping
// Or call tools directly: rg.MCPCall("get_token_budget", map[string]any{"key": "tenant-1", "estimated_tokens": 8000})
```

```jsonc
// Claude Code / Claude Desktop / Cursor config
{ "mcpServers": { "rateguard": { "command": "your-app", "args": ["mcp"] } } }
```

### Node
```ts
const rg = new RateGuard({ preset: 'agent-orchestrator' });
const tools = rg.mcpTools();                       // MCPTool[] for your MCP server framework
const result = await rg.mcpCall('check_loop', { system_prompt: s, user_input: u, sequence_depth: 3 });
```

### Python
```python
rg = RateGuard(preset="agent-orchestrator")
tools = rg.mcp_tools()                             # list[MCPTool] for your MCP server framework
result = rg.mcp_call("get_rate_limit_state", {"key": "tenant-1"})
```

## Loop Detection

SHA-256 payload fingerprinting halts runaway agent loops. A loop is an identical fingerprint reappearing at a **higher** sequence depth; same-depth repeats are treated as retries. Depths beyond `LoopMaxDepth` (default 50) halt regardless. Fingerprint state is LRU-bounded (10K entries).

```go
// Middleware wiring (Go): enable, then agents send headers
rg := rateguard.New(rateguard.Config{Preset: "agent-orchestrator", LoopDetection: true})
// X-Sequence-Depth: 3                (required to activate the check)
// X-Payload-Fingerprint: <sha256>    (optional — else SHA256(method+path+body))
// Detected loops → 429 {"error":"loop_detected", ...}
```

```go
// Library use (any SDK)
fp := rateguard.Fingerprint(systemPrompt, userInput, toolDefs)
allowed, reason := detector.Check(fp, depth)   // records
allowed, reason  = detector.Peek(fp, depth)    // pre-flight, no recording
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

Or let the Go middleware run the chain against every request body:

```go
rg := rateguard.New(rateguard.Config{
    Preset:     "standard",
    Guardrails: rateguard.StandardGuardrails(), // violations → 422 automatically
})
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
