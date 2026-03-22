package telemetry

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

const (
	DefaultServiceName        = "rateguard-control-plane"
	DefaultCollectorEndpoint  = "localhost:4317"
	requestSpanName           = "rateguard.request"
	requestCounterName        = "rateguard.request.count"
	requestDurationMetricName = "rateguard.request.duration_ms"
)

// Observability wires request spans and OTEL metrics.
type Observability struct {
	tracerProvider *sdktrace.TracerProvider
	meterProvider  *sdkmetric.MeterProvider
	tracer         trace.Tracer
	requestCounter metric.Int64Counter
	requestLatency metric.Float64Histogram
}

// Config controls OTEL wiring.
type Config struct {
	ServiceName           string
	OTLPCollectorEndpoint string
	TraceSpanProcessor    sdktrace.SpanProcessor
	MetricReader          sdkmetric.Reader
}

// New constructs runtime observability wiring.
func New(cfg Config) (*Observability, error) {
	serviceName := cfg.ServiceName
	if serviceName == "" {
		serviceName = DefaultServiceName
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

	var spanProcessor sdktrace.SpanProcessor
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
		spanProcessor = sdktrace.NewSimpleSpanProcessor(noopSpanExporter{})
	}

	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithResource(resource),
		sdktrace.WithSpanProcessor(spanProcessor),
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

	return &Observability{
		tracerProvider: tracerProvider,
		meterProvider:  meterProvider,
		tracer:         tracerProvider.Tracer(serviceName),
		requestCounter: requestCounter,
		requestLatency: requestLatency,
	}, nil
}

// Shutdown flushes telemetry exporters.
func (o *Observability) Shutdown(ctx context.Context) error {
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

// StartRequestSpan starts a server span for a request.
func (o *Observability) StartRequestSpan(ctx context.Context, attrs []attribute.KeyValue) (context.Context, trace.Span) {
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

// RecordRequest records request metrics and final span status.
func (o *Observability) RecordRequest(ctx context.Context, attrs []attribute.KeyValue, latency time.Duration, statusCode int) {
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

// RequestAttributes standardizes the request span/metric attribute set.
func RequestAttributes(tenantID, routeID, upstreamID string, rateLimitApplied bool, circuitBreakerState string, queueDepth int) []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.String("tenant_id", tenantID),
		attribute.String("route_id", routeID),
		attribute.String("upstream_id", upstreamID),
		attribute.Bool("rate_limit_applied", rateLimitApplied),
		attribute.String("circuit_breaker_state", circuitBreakerState),
		attribute.Int("queue_depth", queueDepth),
	}
}

type noopSpanExporter struct{}

func (noopSpanExporter) ExportSpans(context.Context, []sdktrace.ReadOnlySpan) error {
	return nil
}

func (noopSpanExporter) Shutdown(context.Context) error {
	return nil
}
