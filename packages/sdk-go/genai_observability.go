package rateguard

import (
	"context"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// ── OpenTelemetry GenAI semantic conventions (v1.29.0, 2026)
// https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai
//
// These spans and metrics make RateGuard a transparent window into LLM API internals.
// Every rate-limited LLM call emits spans with token counts, model info, and cost data
// that plug directly into Datadog, Grafana, Honeycomb, or any OTel backend.

const (
	genaiSpanName             = "gen_ai.client.request"
	genaiOperationChat        = "chat"
	genaiOperationCompletion  = "text_completion"
	genaiOperationEmbedding   = "embedding"

	genaiTokenCounterName       = "gen_ai.client.token.usage"
	genaiOperationDurationName  = "gen_ai.client.operation.duration"
	genaiBudgetRemainingName    = "rateguard.token_budget.remaining"
	genaiBudgetExhaustedName    = "rateguard.token_budget.exhausted"
	genaiRateLimitHitName       = "rateguard.rate_limit.hit"
	genaiStreamChunkCounterName = "gen_ai.client.stream.chunks"
)

// GenAICall represents an LLM API call that RateGuard is protecting.
type GenAICall struct {
	// Required
	Model    string // e.g. "gpt-4o", "claude-opus-4-5", "gemini-2.5-pro"
	Provider string // e.g. "openai", "anthropic", "google"
	Operation string // chat, text_completion, embedding

	// Token counts (set after the LLM response)
	PromptTokens     int64
	CompletionTokens int64
	TotalTokens      int64

	// Streaming (set after stream completes)
	Streaming     bool
	StreamChunks  int64

	// Cost tracking (USD, approximate — set per model pricing)
	EstimatedCostUSD float64

	// Rate limit context
	RateLimitApplied       bool
	TokenBudgetApplied     bool
	TokenBudgetRemaining   int64
	CircuitBreakerState    string
}

// genaiObserver emits OTel spans and metrics for LLM calls passing through RateGuard.
type genaiObserver struct {
	tracer          trace.Tracer
	tokenCounter    metric.Int64Counter
	streamChunks    metric.Int64Counter
	opDuration      metric.Float64Histogram
	budgetRemaining metric.Int64Gauge
	budgetExhausted metric.Int64Counter
	rateLimitHits   metric.Int64Counter
}

func newGenAIObserver(meterProvider metric.MeterProvider, tracerProvider trace.TracerProvider, serviceName string) (*genaiObserver, error) {
	if meterProvider == nil {
		return nil, nil
	}

	meter := meterProvider.Meter(serviceName)

	tokenCounter, err := meter.Int64Counter(genaiTokenCounterName,
		metric.WithDescription("Number of tokens consumed by LLM API calls"),
		metric.WithUnit("{token}"),
	)
	if err != nil {
		return nil, err
	}

	streamChunks, err := meter.Int64Counter(genaiStreamChunkCounterName,
		metric.WithDescription("Number of stream chunks received"),
		metric.WithUnit("{chunk}"),
	)
	if err != nil {
		return nil, err
	}

	opDuration, err := meter.Float64Histogram(genaiOperationDurationName,
		metric.WithDescription("Duration of LLM operations"),
		metric.WithUnit("s"),
	)
	if err != nil {
		return nil, err
	}

	budgetRemaining, err := meter.Int64Gauge(genaiBudgetRemainingName,
		metric.WithDescription("Remaining token budget for this key"),
		metric.WithUnit("{token}"),
	)
	if err != nil {
		return nil, err
	}

	budgetExhausted, err := meter.Int64Counter(genaiBudgetExhaustedName,
		metric.WithDescription("Number of times token budget was exhausted"),
		metric.WithUnit("{exhaustion}"),
	)
	if err != nil {
		return nil, err
	}

	rateLimitHits, err := meter.Int64Counter(genaiRateLimitHitName,
		metric.WithDescription("Number of rate limit hits"),
		metric.WithUnit("{hit}"),
	)
	if err != nil {
		return nil, err
	}

	return &genaiObserver{
		tracer:          tracerProvider.Tracer(serviceName),
		tokenCounter:    tokenCounter,
		streamChunks:    streamChunks,
		opDuration:      opDuration,
		budgetRemaining: budgetRemaining,
		budgetExhausted: budgetExhausted,
		rateLimitHits:   rateLimitHits,
	}, nil
}

// StartSpan begins a GenAI client span with OTel semantic conventions.
func (o *genaiObserver) StartSpan(ctx context.Context, call GenAICall) (context.Context, trace.Span) {
	if o == nil {
		return ctx, trace.SpanFromContext(ctx)
	}

	attrs := []attribute.KeyValue{
		attribute.String("gen_ai.system", call.Provider),
		attribute.String("gen_ai.request.model", call.Model),
		attribute.String("gen_ai.operation.name", call.Operation),
		attribute.Bool("gen_ai.request.is_stream", call.Streaming),
		attribute.Bool("rateguard.rate_limit.applied", call.RateLimitApplied),
		attribute.Bool("rateguard.token_budget.applied", call.TokenBudgetApplied),
		attribute.String("rateguard.circuit_breaker.state", call.CircuitBreakerState),
	}

	return o.tracer.Start(ctx, genaiSpanName,
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(attrs...),
	)
}

// EndSpan records token usage, latency, and cost on the span.
func (o *genaiObserver) EndSpan(span trace.Span, call GenAICall, latency time.Duration) {
	if o == nil {
		return
	}

	attrs := []attribute.KeyValue{
		attribute.Int64("gen_ai.usage.prompt_tokens", call.PromptTokens),
		attribute.Int64("gen_ai.usage.completion_tokens", call.CompletionTokens),
		attribute.Int64("gen_ai.usage.total_tokens", call.TotalTokens),
		attribute.Float64("gen_ai.usage.cost_usd", call.EstimatedCostUSD),
		attribute.Float64("gen_ai.latency_seconds", latency.Seconds()),
		attribute.Bool("gen_ai.request.is_stream", call.Streaming),
	}
	if call.Streaming {
		attrs = append(attrs, attribute.Int64("gen_ai.stream.chunks", call.StreamChunks))
	}
	if call.TokenBudgetApplied {
		attrs = append(attrs, attribute.Int64("rateguard.token_budget.remaining", call.TokenBudgetRemaining))
	}

	span.SetAttributes(attrs...)
	span.End()

	// Record metrics
	o.tokenCounter.Add(context.Background(), call.TotalTokens,
		metric.WithAttributes(
			attribute.String("gen_ai.system", call.Provider),
			attribute.String("gen_ai.request.model", call.Model),
			attribute.String("gen_ai.operation.name", call.Operation),
		),
	)
	o.opDuration.Record(context.Background(), latency.Seconds(),
		metric.WithAttributes(
			attribute.String("gen_ai.system", call.Provider),
			attribute.String("gen_ai.request.model", call.Model),
		),
	)

	if call.TokenBudgetApplied {
		o.budgetRemaining.Record(context.Background(), call.TokenBudgetRemaining,
			metric.WithAttributes(attribute.String("gen_ai.request.model", call.Model)),
		)
		if call.TokenBudgetRemaining <= 0 {
			o.budgetExhausted.Add(context.Background(), 1,
				metric.WithAttributes(attribute.String("gen_ai.request.model", call.Model)),
			)
		}
	}

	if call.RateLimitApplied {
		o.rateLimitHits.Add(context.Background(), 1,
			metric.WithAttributes(attribute.String("gen_ai.request.model", call.Model)),
		)
	}

	if call.Streaming && call.StreamChunks > 0 {
		o.streamChunks.Add(context.Background(), call.StreamChunks,
			metric.WithAttributes(attribute.String("gen_ai.system", call.Provider)),
		)
	}
}

// RecordStreamChunk increments the stream chunk counter mid-stream.
func (o *genaiObserver) RecordStreamChunk(ctx context.Context, provider string) {
	if o == nil {
		return
	}
	o.streamChunks.Add(ctx, 1,
		metric.WithAttributes(attribute.String("gen_ai.system", provider)),
	)
}

// ── Model pricing lookup (2026 market rates, approximate USD per 1K tokens) ──

type modelPricing struct {
	PromptUSD      float64
	CompletionUSD  float64
}

var modelPricing2026 = map[string]modelPricing{
	// OpenAI
	"gpt-4o":                   {PromptUSD: 0.0025, CompletionUSD: 0.010},
	"gpt-4o-mini":              {PromptUSD: 0.00015, CompletionUSD: 0.0006},
	"gpt-4.1":                  {PromptUSD: 0.002, CompletionUSD: 0.008},
	"gpt-4.1-mini":             {PromptUSD: 0.0001, CompletionUSD: 0.0004},
	"o3":                       {PromptUSD: 0.010, CompletionUSD: 0.040},
	"o4-mini":                  {PromptUSD: 0.0011, CompletionUSD: 0.0044},
	// Anthropic
	"claude-opus-4-5":          {PromptUSD: 0.015, CompletionUSD: 0.075},
	"claude-sonnet-4":          {PromptUSD: 0.003, CompletionUSD: 0.015},
	"claude-haiku-3.5":         {PromptUSD: 0.0008, CompletionUSD: 0.004},
	// Google
	"gemini-2.5-pro":           {PromptUSD: 0.00125, CompletionUSD: 0.010},
	"gemini-2.5-flash":        {PromptUSD: 0.000075, CompletionUSD: 0.0003},
	// Open source / hosted
	"llama-3.3-70b":            {PromptUSD: 0.00059, CompletionUSD: 0.00079},
	"deepseek-v3":              {PromptUSD: 0.00027, CompletionUSD: 0.0011},
	"deepseek-r1":              {PromptUSD: 0.00055, CompletionUSD: 0.00219},
}

// EstimateCost calculates approximate USD cost for an LLM call.
func EstimateCost(model string, promptTokens, completionTokens int64) float64 {
	pricing, ok := modelPricing2026[model]
	if !ok {
		// Unknown model — return zero (don't fabricate costs)
		return 0
	}
	promptCost := float64(promptTokens) / 1000 * pricing.PromptUSD
	completionCost := float64(completionTokens) / 1000 * pricing.CompletionUSD
	return promptCost + completionCost
}
