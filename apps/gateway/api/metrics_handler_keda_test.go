package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestGetKEDAMetricsReturnsPrometheusText(t *testing.T) {
	t.Parallel()

	handler := NewMetricsHandler(nil, nil, nil, nil, nil)
	app := fiber.New()
	app.Get("/metrics/keda", handler.GetKEDAMetrics())

	req := httptest.NewRequest(http.MethodGet, "/metrics/keda", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body error = %v", err)
	}
	body := string(bodyBytes)

	for _, want := range []string{
		"# TYPE queue_depth_per_upstream gauge",
		"queue_depth_per_upstream",
		"p95_latency_per_upstream",
		"circuit_breaker_open_rate",
		"error_burst_rate_1m",
		"active_consumer_count",
		"redis_stream_lag",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("response missing %q:\n%s", want, body)
		}
	}
}
