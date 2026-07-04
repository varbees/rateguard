package rateguard

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
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
	genaiSpanName            = "gen_ai.client.request"
	genaiOperationChat       = "chat"
	genaiOperationCompletion = "text_completion"
	genaiOperationEmbedding  = "embedding"

	genaiTokenCounterName       = "gen_ai.client.token.usage"
	genaiOperationDurationName  = "gen_ai.client.operation.duration"
	genaiBudgetRemainingName    = "rateguard.token_budget.remaining"
	genaiBudgetExhaustedName    = "rateguard.token_budget.exhausted"
	genaiRateLimitHitName       = "rateguard.rate_limit.hit"
	genaiStreamChunkCounterName = "gen_ai.client.stream.chunks"
	genaiTTFTName               = "gen_ai.client.operation.time_to_first_chunk"
	genaiTPOTName               = "gen_ai.client.operation.time_per_output_chunk"
)

// GenAICall represents an LLM API call that RateGuard is protecting.
type GenAICall struct {
	// Required
	Model     string // e.g. "gpt-4o", "claude-opus-4-5", "gemini-2.5-pro"
	Provider  string // e.g. "openai", "anthropic", "google"
	Operation string // chat, text_completion, embedding

	// Token counts (set after the LLM response)
	PromptTokens     int64
	CompletionTokens int64
	TotalTokens      int64

	// Streaming (set after stream completes)
	Streaming    bool
	StreamChunks int64

	// Streaming latency metrics (OTel gen_ai.client.operation.*)
	TimeToFirstChunkMs   int64   // TTFT — time to first token/chunk
	TimePerOutputChunkMs float64 // TPOT — average time per output chunk

	// Conversation/response tracking (OTel gen_ai.conversation.id / gen_ai.response.id)
	ConversationID string
	ResponseID     string

	// Cost tracking (USD, approximate — set per model pricing)
	EstimatedCostUSD float64

	// Rate limit context
	RateLimitApplied     bool
	TokenBudgetApplied   bool
	TokenBudgetRemaining int64
	CircuitBreakerState  string
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
	ttftHistogram   metric.Float64Histogram
	tpotHistogram   metric.Float64Histogram
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

	ttftHistogram, err := meter.Float64Histogram(genaiTTFTName,
		metric.WithDescription("Time to first token/chunk in streaming LLM calls"),
		metric.WithUnit("ms"),
	)
	if err != nil {
		return nil, err
	}

	tpotHistogram, err := meter.Float64Histogram(genaiTPOTName,
		metric.WithDescription("Average time per output chunk in streaming LLM calls"),
		metric.WithUnit("ms"),
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
		ttftHistogram:   ttftHistogram,
		tpotHistogram:   tpotHistogram,
	}, nil
}

// genaiSpanNameFor builds the span name per OTel GenAI semantic conventions:
// "{gen_ai.operation.name} {gen_ai.request.model}", e.g. "chat gpt-4o".
func genaiSpanNameFor(call GenAICall) string {
	operation := call.Operation
	if operation == "" {
		operation = genaiOperationChat
	}
	if call.Model == "" {
		return operation
	}
	return operation + " " + call.Model
}

// classifyErrorType maps an error to a low-cardinality error.type value per
// OTel semantic conventions. Full messages are high-cardinality and must not
// be used as error.type — they break error filtering in metrics backends.
func classifyErrorType(err error) string {
	if err == nil {
		return ""
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, context.Canceled):
		return "canceled"
	default:
		return fmt.Sprintf("%T", err)
	}
}

// StartSpan begins a GenAI client span with OTel semantic conventions.
func (o *genaiObserver) StartSpan(ctx context.Context, call GenAICall) (context.Context, trace.Span) {
	if o == nil {
		return ctx, trace.SpanFromContext(ctx)
	}

	operation := call.Operation
	if operation == "" {
		operation = genaiOperationChat
	}

	attrs := []attribute.KeyValue{
		attribute.String("gen_ai.provider.name", call.Provider),
		attribute.String("gen_ai.request.model", call.Model),
		attribute.String("gen_ai.operation.name", operation),
		attribute.Bool("rateguard.request.is_stream", call.Streaming),
		attribute.Bool("rateguard.rate_limit.applied", call.RateLimitApplied),
		attribute.Bool("rateguard.token_budget.applied", call.TokenBudgetApplied),
		attribute.String("rateguard.circuit_breaker.state", call.CircuitBreakerState),
	}
	if call.ConversationID != "" {
		attrs = append(attrs, attribute.String("gen_ai.conversation.id", call.ConversationID))
	}

	return o.tracer.Start(ctx, genaiSpanNameFor(call),
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(attrs...),
	)
}

// EndSpan records token usage, latency, and cost on the span.
// If err is non-nil, the error.type attribute is set per OTel semantic conventions.
func (o *genaiObserver) EndSpan(span trace.Span, call GenAICall, latency time.Duration, err error) {
	if o == nil {
		return
	}

	attrs := []attribute.KeyValue{
		attribute.Int64("gen_ai.usage.input_tokens", call.PromptTokens),
		attribute.Int64("gen_ai.usage.output_tokens", call.CompletionTokens),
		attribute.Int64("rateguard.usage.total_tokens", call.TotalTokens),
		attribute.Float64("rateguard.usage.cost_usd", call.EstimatedCostUSD),
		attribute.Bool("rateguard.request.is_stream", call.Streaming),
	}
	if call.Streaming {
		attrs = append(attrs, attribute.Int64("rateguard.stream.chunks", call.StreamChunks))
	}
	if call.TokenBudgetApplied {
		attrs = append(attrs, attribute.Int64("rateguard.token_budget.remaining", call.TokenBudgetRemaining))
	}
	if err != nil {
		attrs = append(attrs, attribute.String("error.type", classifyErrorType(err)))
		span.SetStatus(codes.Error, err.Error())
	}
	if call.ResponseID != "" {
		attrs = append(attrs, attribute.String("gen_ai.response.id", call.ResponseID))
	}

	span.SetAttributes(attrs...)
	span.End()

	// Record metrics
	o.tokenCounter.Add(context.Background(), call.TotalTokens,
		metric.WithAttributes(
			attribute.String("gen_ai.provider.name", call.Provider),
			attribute.String("gen_ai.request.model", call.Model),
			attribute.String("gen_ai.operation.name", call.Operation),
		),
	)
	o.opDuration.Record(context.Background(), latency.Seconds(),
		metric.WithAttributes(
			attribute.String("gen_ai.provider.name", call.Provider),
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
			metric.WithAttributes(attribute.String("gen_ai.provider.name", call.Provider)),
		)
	}
	if call.Streaming && call.TimeToFirstChunkMs > 0 {
		o.ttftHistogram.Record(context.Background(), float64(call.TimeToFirstChunkMs),
			metric.WithAttributes(attribute.String("gen_ai.provider.name", call.Provider)),
		)
	}
	if call.Streaming && call.TimePerOutputChunkMs > 0 {
		o.tpotHistogram.Record(context.Background(), call.TimePerOutputChunkMs,
			metric.WithAttributes(attribute.String("gen_ai.provider.name", call.Provider)),
		)
	}
}

// RecordStreamChunk increments the stream chunk counter mid-stream.
func (o *genaiObserver) RecordStreamChunk(ctx context.Context, provider string) {
	if o == nil {
		return
	}
	o.streamChunks.Add(ctx, 1,
		metric.WithAttributes(attribute.String("gen_ai.provider.name", provider)),
	)
}

// ── Public GenAI tracking API ──

// GenAISpan tracks one in-flight LLM call started with SDK.StartGenAICall.
type GenAISpan struct {
	obs        *genaiObserver
	span       trace.Span
	call       GenAICall
	clock      Clock
	start      time.Time
	firstChunk time.Time
	chunks     int64
}

// StartGenAICall opens an OTel GenAI client span for an LLM call.
// Wrap every provider call:
//
//	ctx, gspan := rg.StartGenAICall(ctx, rateguard.GenAICall{Provider: "openai", Model: "gpt-4o", Operation: "chat"})
//	resp, err := client.Chat(ctx, req)
//	gspan.End(rateguard.GenAICall{PromptTokens: usage.Input, CompletionTokens: usage.Output, TotalTokens: usage.Total}, err)
func (s *SDK) StartGenAICall(ctx context.Context, call GenAICall) (context.Context, *GenAISpan) {
	gspan := &GenAISpan{call: call, clock: s.clock}
	if gspan.clock == nil {
		gspan.clock = systemClock{}
	}
	gspan.start = gspan.clock.Now()

	if s.otel != nil && s.otel.genai != nil {
		gspan.obs = s.otel.genai
		ctx, gspan.span = s.otel.genai.StartSpan(ctx, call)
	}
	return ctx, gspan
}

// RecordChunk marks a streaming chunk. The first call sets time-to-first-chunk.
func (g *GenAISpan) RecordChunk() {
	if g == nil {
		return
	}
	g.chunks++
	if g.firstChunk.IsZero() {
		g.firstChunk = g.clock.Now()
	}
}

// End completes the span with final usage. Zero-value fields in final fall
// back to the values passed at start. Cost is estimated automatically from
// the pricing table when not provided.
func (g *GenAISpan) End(final GenAICall, err error) {
	if g == nil {
		return
	}

	call := g.call
	if final.Model != "" {
		call.Model = final.Model
	}
	if final.Provider != "" {
		call.Provider = final.Provider
	}
	if final.Operation != "" {
		call.Operation = final.Operation
	}
	if final.PromptTokens > 0 {
		call.PromptTokens = final.PromptTokens
	}
	if final.CompletionTokens > 0 {
		call.CompletionTokens = final.CompletionTokens
	}
	if final.TotalTokens > 0 {
		call.TotalTokens = final.TotalTokens
	}
	if call.TotalTokens == 0 {
		call.TotalTokens = call.PromptTokens + call.CompletionTokens
	}
	if final.EstimatedCostUSD > 0 {
		call.EstimatedCostUSD = final.EstimatedCostUSD
	}
	if call.EstimatedCostUSD == 0 {
		call.EstimatedCostUSD = EstimateCost(call.Model, call.PromptTokens, call.CompletionTokens)
	}
	if final.ResponseID != "" {
		call.ResponseID = final.ResponseID
	}

	latency := g.clock.Now().Sub(g.start)
	if g.chunks > 0 {
		call.Streaming = true
		call.StreamChunks = g.chunks
		if !g.firstChunk.IsZero() {
			call.TimeToFirstChunkMs = g.firstChunk.Sub(g.start).Milliseconds()
		}
		call.TimePerOutputChunkMs = float64(latency.Milliseconds()) / float64(g.chunks)
	}
	if final.StreamChunks > 0 {
		call.StreamChunks = final.StreamChunks
	}
	if final.TimeToFirstChunkMs > 0 {
		call.TimeToFirstChunkMs = final.TimeToFirstChunkMs
	}
	if final.TimePerOutputChunkMs > 0 {
		call.TimePerOutputChunkMs = final.TimePerOutputChunkMs
	}

	if g.obs != nil && g.span != nil {
		g.obs.EndSpan(g.span, call, latency, err)
	}
}

// ── Model pricing lookup (2026 market rates, approximate USD per 1K tokens) ──

type modelPricing struct {
	PromptUSD     float64
	CompletionUSD float64
}

var modelPricing2026 = map[string]modelPricing{
	// OpenAI
	"gpt-4o":       {PromptUSD: 0.0025, CompletionUSD: 0.010},
	"gpt-4o-mini":  {PromptUSD: 0.00015, CompletionUSD: 0.0006},
	"gpt-4.1":      {PromptUSD: 0.002, CompletionUSD: 0.008},
	"gpt-4.1-mini": {PromptUSD: 0.0001, CompletionUSD: 0.0004},
	"o3":           {PromptUSD: 0.002, CompletionUSD: 0.008},
	"o4-mini":      {PromptUSD: 0.0011, CompletionUSD: 0.0044},
	// Anthropic
	"claude-opus-4-5":  {PromptUSD: 0.005, CompletionUSD: 0.025},
	"claude-sonnet-4":  {PromptUSD: 0.003, CompletionUSD: 0.015},
	"claude-haiku-3.5": {PromptUSD: 0.0008, CompletionUSD: 0.004},
	// Google
	"gemini-2.5-pro":   {PromptUSD: 0.00125, CompletionUSD: 0.010},
	"gemini-2.5-flash": {PromptUSD: 0.000075, CompletionUSD: 0.0003},
	// Open source / hosted
	"llama-3.3-70b": {PromptUSD: 0.00059, CompletionUSD: 0.00079},
	"deepseek-v3":   {PromptUSD: 0.00027, CompletionUSD: 0.0011},
	"deepseek-r1":   {PromptUSD: 0.00055, CompletionUSD: 0.00219},
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
