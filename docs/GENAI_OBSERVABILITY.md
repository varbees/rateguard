# GenAI Observability

RateGuard's Go SDK emits OpenTelemetry spans and metrics for LLM calls using the official GenAI semantic conventions. Node and Python expose matching semconv attribute builders and cost helpers so apps can wire the same data into their tracer. Span names follow the semconv format `{operation} {model}` (e.g. `chat gpt-4o`). Standard `gen_ai.*` attributes are used where the convention defines them; RateGuard-specific data lives under the `rateguard.*` namespace so the reserved namespace stays clean.

## What gets traced

Every LLM call through RateGuard produces:

```
chat gpt-4o                                  ← span name: {operation} {model}
├── gen_ai.provider.name: "openai" | "anthropic" | "google"
├── gen_ai.request.model: "gpt-4o" | "claude-opus-4-5" | "gemini-2.5-pro"
├── gen_ai.operation.name: "chat" | "text_completion" | "embedding"
├── gen_ai.usage.input_tokens: 1234
├── gen_ai.usage.output_tokens: 567
├── gen_ai.conversation.id / gen_ai.response.id (when provided)
├── error.type: "timeout" | "canceled" | error class   (low-cardinality, errors only)
├── rateguard.usage.total_tokens: 1801
├── rateguard.usage.cost_usd: 0.00877
├── rateguard.request.is_stream: true | false
├── rateguard.stream.chunks: 42 (streaming only)
├── rateguard.rate_limit.applied: true | false
├── rateguard.token_budget.applied: true | false
├── rateguard.token_budget.remaining: 950000
└── rateguard.circuit_breaker.state: "closed" | "open" | "half-open"
```

## Public API (Go)

```go
ctx, span := rg.StartGenAICall(ctx, rateguard.GenAICall{Provider: "openai", Model: "gpt-4o", Operation: "chat"})
resp, err := client.Chat(ctx, req)
span.RecordChunk() // optional, per streaming chunk — first call sets TTFT
span.End(rateguard.GenAICall{PromptTokens: usage.Input, CompletionTokens: usage.Output}, err)
```

Cost is estimated automatically from the pricing table when not provided. TTFT and TPOT are derived from `RecordChunk()` timing. Node and Python expose the same attribute builders via `genaiSpanName`/`genai_span_name`, `genaiSpanAttributes`/`genai_span_attributes`, and `genaiSpanEndAttributes`/`genai_span_end_attributes`.

## Metrics emitted

| Metric | Type | Description |
|---|---|---|
| `gen_ai.client.token.usage` | Counter | Total tokens consumed per model |
| `gen_ai.client.operation.duration` | Histogram | LLM call latency in seconds |
| `gen_ai.client.stream.chunks` | Counter | Streaming chunks received |
| `rateguard.token_budget.remaining` | Gauge | Remaining token budget |
| `rateguard.token_budget.exhausted` | Counter | Budget exhaustion events |
| `rateguard.rate_limit.hit` | Counter | Rate limit hits |

## Model pricing

The built-in table (65 rows: Anthropic, OpenAI, Google, DeepSeek) is generated from
`conformance/pricing.json`, where every row cites the vendor page and the day it was read.
Dated snapshots resolve to their base entry via model-ID normalization. Supply a
`PricingProvider`/`StaticPricing` map to price custom, fine-tuned, or unlisted models with no
fetched file or network. Costs are approximate estimates (never enforcement, never invoice
truth). Unknown models return `$0.00` — costs are never fabricated.

**Prompt caching.** Usage carries the cached part of the prompt separately: `InputTokens` is the
whole prompt (Anthropic's three counters summed; OpenAI/DeepSeek/Gemini as reported) and
`CacheReadTokens`, `CacheWriteTokens`, `CacheWriteLongTTLTokens` are subsets of it.
`EstimateUsageCost` / `estimateUsageCost` / `estimate_usage_cost` price each part at its own rate
(cache hit, 5m/30m write, 1h/12h write) and pick a long-context tier on the whole prompt.
`EstimateCost(model, prompt, completion)` prices every prompt token at the input rate. Spans
carry `gen_ai.usage.cache_read.input_tokens` and `gen_ai.usage.cache_creation.input_tokens` when
non-zero. Gemini context-cache storage (per token-hour) is not modelled.

## Setup

### Go
```go
rg := rateguard.New(rateguard.Config{
    Preset:                "streaming-llm",
    ServiceName:           "my-llm-service",
    OTLPCollectorEndpoint: "localhost:4317",
})
// Go outbound wrappers and StartGenAICall emit spans from this configuration.
```

### Node.js
```ts
import { estimateCost, genaiSpanAttributes, genaiSpanEndAttributes } from '@varbees/rateguard-node/genai';

const call = { model: 'gpt-4o', provider: 'openai', ... };
const attrs = genaiSpanAttributes(call);
// Wire into your OTel tracer
```

### Python
```python
from rateguard.core.genai import estimate_cost, genai_span_attributes

cost = estimate_cost("claude-opus-4-5", 5000, 2000)
# $0.075 (5000/1000 * $0.005 + 2000/1000 * $0.025)

from rateguard import TokenUsage, estimate_usage_cost
# 5,000-token prompt, 4,000 of it read from cache ($0.0005/1K on Opus 4.5)
cost = estimate_usage_cost("claude-opus-4-5", TokenUsage(input_tokens=5000, output_tokens=2000, cache_read_tokens=4000))
# $0.057 (1000/1000 * $0.005 + 4000/1000 * $0.0005 + 2000/1000 * $0.025)
```

## Streaming support

For streaming LLM calls (SSE/WebSocket), call `RecordChunk()` on the span for each chunk — the first call sets time-to-first-chunk (TTFT), and time-per-output-chunk (TPOT) is derived at `End`:

```go
ctx, span := rg.StartGenAICall(ctx, rateguard.GenAICall{Provider: "openai", Model: "gpt-4o"})
for chunk := range stream {
    span.RecordChunk()
    // ... process chunk
}
span.End(rateguard.GenAICall{PromptTokens: in, CompletionTokens: out}, nil)
```

## Backend integration

RateGuard's OTel spans work with any OTLP-compatible backend:

- **Datadog** — OTLP ingestion endpoint
- **Grafana** — Tempo + Prometheus
- **Honeycomb** — OTLP over gRPC
- **Jaeger** — OTLP collector
- **Langfuse** — Via OTel bridge
- **Prometheus** — `/metrics` endpoint (built-in, no OTel needed)
