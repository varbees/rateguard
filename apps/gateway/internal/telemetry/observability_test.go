package telemetry

import (
	"context"
	"net/http"
	"testing"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestObservabilityRecordsSpanAndMetrics(t *testing.T) {
	t.Parallel()

	spanRecorder := tracetest.NewSpanRecorder()
	reader := sdkmetric.NewManualReader()

	obs, err := New(Config{
		ServiceName:        "rateguard-test",
		TraceSpanProcessor: spanRecorder,
		MetricReader:       reader,
	})
	if err != nil {
		t.Fatalf("New error = %v", err)
	}

	attrs := RequestAttributes("tenant-a", "route-a", "upstream-a", true, "closed", 7)
	ctx, span := obs.StartRequestSpan(context.Background(), attrs)
	obs.RecordRequest(ctx, attrs, 25*time.Millisecond, http.StatusAccepted)
	span.End()

	spans := spanRecorder.Ended()
	if len(spans) != 1 {
		t.Fatalf("ended spans = %d, want 1", len(spans))
	}

	recorded := spans[0]
	if recorded.Name() != requestSpanName {
		t.Fatalf("span name = %q, want %q", recorded.Name(), requestSpanName)
	}
	if recorded.Status().Code != codes.Ok {
		t.Fatalf("span status = %v, want %v", recorded.Status().Code, codes.Ok)
	}

	spanAttrs := make(map[attribute.Key]attribute.Value, len(recorded.Attributes()))
	for _, kv := range recorded.Attributes() {
		spanAttrs[kv.Key] = kv.Value
	}

	checkStringAttr(t, spanAttrs, "tenant_id", "tenant-a")
	checkStringAttr(t, spanAttrs, "route_id", "route-a")
	checkStringAttr(t, spanAttrs, "upstream_id", "upstream-a")
	checkStringAttr(t, spanAttrs, "circuit_breaker_state", "closed")
	checkIntAttr(t, spanAttrs, "queue_depth", 7)
	checkIntAttr(t, spanAttrs, "status_code", http.StatusAccepted)

	rm := &metricdata.ResourceMetrics{}
	if err := reader.Collect(context.Background(), rm); err != nil {
		t.Fatalf("reader.Collect error = %v", err)
	}

	requestMetric, ok := metricDataByName(rm, requestCounterName)
	if !ok {
		t.Fatalf("missing metric %q", requestCounterName)
	}
	if !metricHasCountValue(requestMetric, 1) {
		t.Fatalf("metric %q does not contain count 1", requestCounterName)
	}

	latencyMetric, ok := metricDataByName(rm, requestDurationMetricName)
	if !ok {
		t.Fatalf("missing metric %q", requestDurationMetricName)
	}
	if !metricHasHistogramCount(latencyMetric, 1) {
		t.Fatalf("metric %q does not contain one histogram point", requestDurationMetricName)
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
