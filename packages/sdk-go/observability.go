package rateguard

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

const (
	defaultServiceName        = "rateguard-go-sdk"
	requestSpanName           = "rateguard.request"
	requestCounterName        = "rateguard.request.count"
	requestDurationMetricName = "rateguard.request.duration_ms"
)

type observability struct {
	tracerProvider *sdktrace.TracerProvider
	meterProvider  *sdkmetric.MeterProvider
	tracer         trace.Tracer
	requestCounter metric.Int64Counter
	requestLatency metric.Float64Histogram
	genai          *genaiObserver
}

func newObservability(cfg Config) (*observability, error) {
	serviceName := cfg.ServiceName
	if serviceName == "" {
		serviceName = defaultServiceName
	}

	reader := cfg.MetricReader
	if reader == nil {
		reader = sdkmetric.NewManualReader()
	}

	resource, err := sdkresource.New(
		context.Background(),
		sdkresource.WithAttributes(attribute.String("service.name", serviceName)),
	)
	if err != nil {
		resource = sdkresource.Default()
	}

	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(reader),
		sdkmetric.WithResource(resource),
	)

	// Sampling decides whether a span RECORDS. A recording span allocates its
	// attribute set, dedupes it, and holds it for export. When nothing is
	// exporting, all of that work is thrown away — measured at ~26µs and 10KB
	// per request, which is most of RateGuard's overhead and all of it waste.
	//
	// So: record only when something is actually consuming the spans. With no
	// exporter configured, NeverSample makes spans non-recording and the OTel
	// machinery short-circuits. The tracer stays real, and the API contract is
	// unchanged — a span is still returned, it just costs nothing.
	var spanProcessor sdktrace.SpanProcessor
	sampler := sdktrace.AlwaysSample()
	switch {
	case cfg.TraceSpanProcessor != nil:
		spanProcessor = cfg.TraceSpanProcessor
	case cfg.OTLPCollectorEndpoint != "":
		exporter, err := otlptracegrpc.New(
			context.Background(),
			otlptracegrpc.WithEndpoint(cfg.OTLPCollectorEndpoint),
			otlptracegrpc.WithInsecure(),
		)
		if err != nil {
			return nil, fmt.Errorf("build OTLP trace exporter: %w", err)
		}
		spanProcessor = sdktrace.NewBatchSpanProcessor(exporter)
	default:
		// Nothing is exporting: keep the processor for shape, never record.
		spanProcessor = sdktrace.NewSimpleSpanProcessor(noopSpanExporter{})
		sampler = sdktrace.NeverSample()
	}

	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithResource(resource),
		sdktrace.WithSpanProcessor(spanProcessor),
		sdktrace.WithSampler(sampler),
	)

	meter := meterProvider.Meter(serviceName)
	requestCounter, err := meter.Int64Counter(requestCounterName)
	if err != nil {
		return nil, fmt.Errorf("create request counter: %w", err)
	}
	requestLatency, err := meter.Float64Histogram(requestDurationMetricName)
	if err != nil {
		return nil, fmt.Errorf("create request latency histogram: %w", err)
	}

	genai, err := newGenAIObserver(meterProvider, tracerProvider, serviceName)
	if err != nil {
		return nil, fmt.Errorf("create genai observer: %w", err)
	}

	return &observability{
		tracerProvider: tracerProvider,
		meterProvider:  meterProvider,
		tracer:         tracerProvider.Tracer(serviceName),
		requestCounter: requestCounter,
		requestLatency: requestLatency,
		genai:          genai,
	}, nil
}

func (o *observability) Shutdown(ctx context.Context) error {
	if o == nil {
		return nil
	}

	var shutdownErr error
	if o.tracerProvider != nil {
		if err := o.tracerProvider.Shutdown(ctx); err != nil {
			shutdownErr = err
		}
	}
	if o.meterProvider != nil {
		if err := o.meterProvider.Shutdown(ctx); err != nil && shutdownErr == nil {
			shutdownErr = err
		}
	}
	return shutdownErr
}

func (o *observability) startRequestSpan(ctx context.Context, attrs []attribute.KeyValue) (context.Context, trace.Span) {
	if o == nil {
		return ctx, trace.SpanFromContext(ctx)
	}

	return o.tracer.Start(
		ctx,
		requestSpanName,
		trace.WithSpanKind(trace.SpanKindServer),
		trace.WithAttributes(attrs...),
	)
}

func (o *observability) recordRequest(ctx context.Context, attrs []attribute.KeyValue, latency time.Duration, statusCode int) {
	if o == nil {
		return
	}

	o.requestCounter.Add(ctx, 1, metric.WithAttributes(attrs...))
	o.requestLatency.Record(ctx, float64(latency.Milliseconds()), metric.WithAttributes(attrs...))

	span := trace.SpanFromContext(ctx)
	span.SetAttributes(
		append(
			append([]attribute.KeyValue(nil), attrs...),
			attribute.Int("status_code", statusCode),
			attribute.Float64("latency_ms", float64(latency.Milliseconds())),
		)...,
	)
	if statusCode >= http.StatusInternalServerError {
		span.SetStatus(codes.Error, "request failed")
		return
	}
	span.SetStatus(codes.Ok, "request completed")
}

func requestAttributes(tenantID, routeID, upstreamID string, rateLimitApplied bool, circuitBreakerState string, queueDepth int) []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.String("tenant_id", tenantID),
		attribute.String("route_id", routeID),
		attribute.String("upstream_id", upstreamID),
		attribute.Bool("rate_limit_applied", rateLimitApplied),
		attribute.String("circuit_breaker_state", circuitBreakerState),
		attribute.Int("queue_depth", queueDepth),
	}
}

func traceContextFromHeaders(h http.Header) context.Context {
	propagator := propagation.TraceContext{}
	return propagator.Extract(context.Background(), propagation.HeaderCarrier(h))
}

type noopSpanExporter struct{}

func (noopSpanExporter) ExportSpans(context.Context, []sdktrace.ReadOnlySpan) error {
	return nil
}

func (noopSpanExporter) Shutdown(context.Context) error {
	return nil
}
