package rateguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.opentelemetry.io/otel/attribute"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestHTTPMiddlewareRecordsOpenTelemetrySpan(t *testing.T) {
	t.Parallel()

	spanRecorder := tracetest.NewSpanRecorder()
	clock := &fakeClock{now: time.Date(2026, 3, 20, 12, 0, 0, 0, time.UTC)}

	sdk := New(Config{
		Preset:                PresetStandard,
		TenantID:              "tenant-a",
		RouteID:               "route-a",
		UpstreamID:            "upstream-a",
		OTLPCollectorEndpoint: "",
		TraceSpanProcessor:    spanRecorder,
		Clock:                 clock,
	})

	req := httptest.NewRequest(http.MethodGet, "http://example.com/v1/widgets", nil)
	req.Header.Set("traceparent", "00-0123456789abcdef0123456789abcdef-abcdef0123456789-01")
	rr := httptest.NewRecorder()

	sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})).ServeHTTP(rr, req)

	spans := spanRecorder.Ended()
	if len(spans) != 1 {
		t.Fatalf("recorded spans = %d, want 1", len(spans))
	}

	span := spans[0]
	if span.Name() != "rateguard.request" {
		t.Fatalf("span name = %q, want rateguard.request", span.Name())
	}

	attrs := map[attribute.Key]attribute.Value{}
	for _, kv := range span.Attributes() {
		attrs[kv.Key] = kv.Value
	}

	checkStringAttr(t, attrs, "tenant_id", "tenant-a")
	checkStringAttr(t, attrs, "route_id", "route-a")
	checkStringAttr(t, attrs, "upstream_id", "upstream-a")
	checkIntAttr(t, attrs, "status_code", 202)
	checkStringAttr(t, attrs, "circuit_breaker_state", "closed")
}

func TestHTTPMiddlewareRecordsOpenTelemetryMetrics(t *testing.T) {
	t.Parallel()

	reader := sdkmetric.NewManualReader()
	clock := &fakeClock{now: time.Date(2026, 3, 20, 12, 0, 0, 0, time.UTC)}

	sdk := New(Config{
		Preset:       PresetStandard,
		TenantID:     "tenant-a",
		RouteID:      "route-a",
		UpstreamID:   "upstream-a",
		MetricReader: reader,
		Clock:        clock,
	})

	req := httptest.NewRequest(http.MethodGet, "http://example.com/v1/widgets", nil)
	rr := httptest.NewRecorder()

	sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	rm := &metricdata.ResourceMetrics{}
	if err := reader.Collect(context.Background(), rm); err != nil {
		t.Fatalf("reader.Collect error = %v", err)
	}

	requestMetric, ok := metricDataByName(rm, "rateguard.request.count")
	if !ok {
		t.Fatal("missing request counter metric")
	}
	if !metricHasCountValue(requestMetric, 1) {
		t.Fatalf("request counter metric does not contain value 1: %+v", requestMetric)
	}

	latencyMetric, ok := metricDataByName(rm, "rateguard.request.duration_ms")
	if !ok {
		t.Fatal("missing latency histogram metric")
	}
	if !metricHasHistogramCount(latencyMetric, 1) {
		t.Fatalf("latency histogram metric does not contain one point: %+v", latencyMetric)
	}
}

func checkStringAttr(t *testing.T, attrs map[attribute.Key]attribute.Value, key, want string) {
	t.Helper()

	value, ok := attrs[attribute.Key(key)]
	if !ok {
		t.Fatalf("missing attribute %q", key)
	}
	if got := value.AsString(); got != want {
		t.Fatalf("attribute %q = %q, want %q", key, got, want)
	}
}

func checkIntAttr(t *testing.T, attrs map[attribute.Key]attribute.Value, key string, want int) {
	t.Helper()

	value, ok := attrs[attribute.Key(key)]
	if !ok {
		t.Fatalf("missing attribute %q", key)
	}
	if got := int(value.AsInt64()); got != want {
		t.Fatalf("attribute %q = %d, want %d", key, got, want)
	}
}

func metricDataByName(rm *metricdata.ResourceMetrics, name string) (metricdata.Metrics, bool) {
	for _, scopeMetrics := range rm.ScopeMetrics {
		for _, metric := range scopeMetrics.Metrics {
			if metric.Name == name {
				return metric, true
			}
		}
	}
	return metricdata.Metrics{}, false
}

func metricHasCountValue(metric metricdata.Metrics, want int64) bool {
	sum, ok := metric.Data.(metricdata.Sum[int64])
	if !ok {
		return false
	}
	for _, point := range sum.DataPoints {
		if point.Value == want {
			return true
		}
	}
	return false
}

func metricHasHistogramCount(metric metricdata.Metrics, want uint64) bool {
	histogram, ok := metric.Data.(metricdata.Histogram[float64])
	if !ok {
		return false
	}
	for _, point := range histogram.DataPoints {
		if point.Count == want {
			return true
		}
	}
	return false
}

type fakeClock struct {
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	return c.now
}
