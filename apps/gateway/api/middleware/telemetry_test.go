package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/telemetry"
	"go.opentelemetry.io/otel/attribute"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestTelemetryMiddlewareRecordsRouteContext(t *testing.T) {
	t.Parallel()

	spanRecorder := tracetest.NewSpanRecorder()
	reader := sdkmetric.NewManualReader()

	mw, err := NewTelemetryMiddleware(telemetry.Config{
		ServiceName:        "rateguard-test",
		TraceSpanProcessor: spanRecorder,
		MetricReader:       reader,
	})
	if err != nil {
		t.Fatalf("NewTelemetryMiddleware error = %v", err)
	}

	app := fiber.New()
	app.Use(mw.Trace)
	app.Get("/v1/widgets", func(c *fiber.Ctx) error {
		c.Locals("tenant_id", "tenant-a")
		c.Locals("circuit_breaker_state", "half-open")
		c.Locals("queue_depth", 3)
		c.Set("X-RateGuard-Limit", "100")
		return c.Status(http.StatusCreated).JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/widgets", nil)
	req.Header.Set("traceparent", "00-0123456789abcdef0123456789abcdef-abcdef0123456789-01")
	req.Header.Set("X-RateGuard-Upstream-ID", "upstream-a")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test error = %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status code = %d, want %d", resp.StatusCode, http.StatusCreated)
	}

	spans := spanRecorder.Ended()
	if len(spans) != 1 {
		t.Fatalf("ended spans = %d, want 1", len(spans))
	}

	recorded := spans[0]
	attrs := make(map[attribute.Key]attribute.Value, len(recorded.Attributes()))
	for _, kv := range recorded.Attributes() {
		attrs[kv.Key] = kv.Value
	}

	checkStringAttr(t, attrs, "tenant_id", "tenant-a")
	checkStringAttr(t, attrs, "route_id", "/v1/widgets")
	checkStringAttr(t, attrs, "upstream_id", "upstream-a")
	checkStringAttr(t, attrs, "circuit_breaker_state", "half-open")
	checkIntAttr(t, attrs, "queue_depth", 3)
	checkIntAttr(t, attrs, "status_code", http.StatusCreated)

	rm := &metricdata.ResourceMetrics{}
	if err := reader.Collect(context.Background(), rm); err != nil {
		t.Fatalf("reader.Collect error = %v", err)
	}

	requestMetric, ok := metricDataByName(rm, telemetryRequestCounterName)
	if !ok {
		t.Fatalf("missing request counter metric")
	}
	if !metricHasCountValue(requestMetric, 1) {
		t.Fatalf("request counter metric does not contain value 1")
	}
}

const telemetryRequestCounterName = "rateguard.request.count"

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
