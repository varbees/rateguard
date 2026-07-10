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

A starter table prices ~14 common models (USD per 1K tokens); dated snapshots resolve to their base entry via model-ID normalization. Supply a `PricingProvider`/`StaticPricing` map to price custom, fine-tuned, or unlisted models with no fetched file or network. Costs are approximate display estimates (never enforcement, never invoice truth); re-check provider pricing pages before publishing a release.

| Model | Prompt ($/1K) | Completion ($/1K) |
|---|---|---|
| GPT-4o | $0.0025 | $0.010 |
| GPT-4o Mini | $0.00015 | $0.0006 |
| GPT-4.1 | $0.002 | $0.008 |
| GPT-4.1 Mini | $0.0001 | $0.0004 |
| o3 | $0.002 | $0.008 |
| o4-mini | $0.0011 | $0.0044 |
| Claude Opus 4.5 | $0.005 | $0.025 |
| Claude Sonnet 4 | $0.003 | $0.015 |
| Claude Haiku 3.5 | $0.0008 | $0.004 |
| Gemini 2.5 Pro | $0.00125 | $0.010 |
| Gemini 2.5 Flash | $0.000075 | $0.0003 |
| Llama 3.3 70B | $0.00059 | $0.00079 |
| DeepSeek V3 | $0.00027 | $0.0011 |
| DeepSeek R1 | $0.00055 | $0.00219 |

Full list in `genai_observability.go` / `genai.ts` / `genai.py`. Unknown models return `$0.00` — we never fabricate costs.

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
