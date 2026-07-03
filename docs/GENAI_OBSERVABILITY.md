# GenAI Observability

RateGuard emits OpenTelemetry spans and metrics for every LLM call using the official GenAI semantic conventions (v1.29.0, 2026).

## What gets traced

Every LLM call through RateGuard produces:

```
gen_ai.client.request
├── gen_ai.system: "openai" | "anthropic" | "google"
├── gen_ai.request.model: "gpt-4o" | "claude-opus-4-5" | "gemini-2.5-pro"
├── gen_ai.operation.name: "chat" | "text_completion" | "embedding"
├── gen_ai.request.is_stream: true | false
├── gen_ai.usage.prompt_tokens: 1234
├── gen_ai.usage.completion_tokens: 567
├── gen_ai.usage.total_tokens: 1801
├── gen_ai.usage.cost_usd: 0.00877
├── gen_ai.latency_seconds: 1.234
├── gen_ai.stream.chunks: 42 (streaming only)
├── rateguard.rate_limit.applied: true | false
├── rateguard.token_budget.applied: true | false
├── rateguard.token_budget.remaining: 950000
└── rateguard.circuit_breaker.state: "closed" | "open" | "half-open"
```

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

28 models priced at 2026 market rates. Costs are approximate (USD per 1K tokens).

| Model | Prompt ($/1K) | Completion ($/1K) |
|---|---|---|
| GPT-4o | $0.0025 | $0.010 |
| GPT-4o Mini | $0.00015 | $0.0006 |
| Claude Opus 4.5 | $0.015 | $0.075 |
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
// Spans automatically emitted on every LLM call through middleware
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
# $0.225 (5000/1000 * $0.015 + 2000/1000 * $0.075)
```

## Streaming support

For streaming LLM calls (SSE/WebSocket), call `RecordStreamChunk()` for each chunk:

```go
for chunk := range stream {
    rg.GenAI.RecordStreamChunk(ctx, "openai")
    // ... process chunk
}
// EndSpan() after stream closes — total chunks counted
```

## Backend integration

RateGuard's OTel spans work with any OTLP-compatible backend:

- **Datadog** — OTLP ingestion endpoint
- **Grafana** — Tempo + Prometheus
- **Honeycomb** — OTLP over gRPC
- **Jaeger** — OTLP collector
- **Langfuse** — Via OTel bridge
- **Prometheus** — `/metrics` endpoint (built-in, no OTel needed)
