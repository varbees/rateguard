package aggregator

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/pool"
	"github.com/varbees/rateguard/internal/ratelimiter"
	"github.com/varbees/rateguard/pkg/logger"
)

func init() {
	// Initialize logger for tests
	_ = logger.Initialize(logger.Config{
		Level:       "error",
		Format:      "console",
		Development: true,
	})
}

func newTestHTTPServer(t testing.TB, handler http.Handler) (server *httptest.Server) {
	t.Helper()

	defer func() {
		if r := recover(); r != nil {
			message := fmt.Sprint(r)
			if strings.Contains(message, "failed to listen on a port") || strings.Contains(message, "operation not permitted") {
				t.Skip("skipping listener-dependent test: local sockets are unavailable in this environment")
			}
			panic(r)
		}
	}()

	return httptest.NewServer(handler)
}

func TestAggregatorCreation(t *testing.T) {
	wp := pool.NetworkerPool(5, 10)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 30*time.Second)

	if agg == nil {
		t.Fatal("Expected aggregator to be created")
	}

	if !agg.Health() {
		t.Error("Expected aggregator to be healthy")
	}
}

func TestAggregatorSingleSource(t *testing.T) {
	wp := pool.NetworkerPool(5, 10)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 30*time.Second)

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"uuid": "test-uuid"}`))
	}))
	defer server.Close()

	sources := []models.APISource{
		{
			Name:    "Test API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
	}

	result, err := agg.Aggregate(context.Background(), sources)
	if err != nil {
		t.Fatalf("Aggregation failed: %v", err)
	}

	if len(result.Results) != 1 {
		t.Errorf("Expected 1 result, got %d", len(result.Results))
	}

	if result.Success != 1 {
		t.Errorf("Expected 1 successful fetch, got %d", result.Success)
	}

	if result.Failed != 0 {
		t.Errorf("Expected 0 failed fetches, got %d", result.Failed)
	}
}

func TestAggregatorMultipleSources(t *testing.T) {
	wp := pool.NetworkerPool(5, 20)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 30*time.Second)

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data": "test"}`))
	}))
	defer server.Close()

	sources := []models.APISource{
		{
			Name:    "UUID API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
		{
			Name:    "IP API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
		{
			Name:    "User Agent API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
	}

	result, err := agg.Aggregate(context.Background(), sources)
	if err != nil {
		t.Fatalf("Aggregation failed: %v", err)
	}

	if len(result.Results) != 3 {
		t.Errorf("Expected 3 results, got %d", len(result.Results))
	}

	if result.Success != 3 {
		t.Errorf("Expected 3 successful fetches, got %d", result.Success)
	}
}

func TestAggregatorEmptySources(t *testing.T) {
	wp := pool.NetworkerPool(5, 10)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 30*time.Second)

	sources := []models.APISource{}

	_, err := agg.Aggregate(context.Background(), sources)
	if err == nil {
		t.Error("Expected error for empty sources")
	}
}

func TestAggregatorTimeout(t *testing.T) {
	wp := pool.NetworkerPool(5, 10)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 1*time.Second) // Very short timeout

	// Create mock server with delay
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sources := []models.APISource{
		{
			Name:    "Slow API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
	}

	start := time.Now()
	result, err := agg.Aggregate(context.Background(), sources)
	duration := time.Since(start)

	// Should timeout around 1 second
	if duration > 2*time.Second {
		t.Errorf("Aggregation took too long: %v", duration)
	}

	// May or may not have error depending on timing
	if result != nil {
		t.Logf("Got %d results with %d failures", result.Success, result.Failed)
	} else if err != nil {
		t.Logf("Got error as expected: %v", err)
	}
}

func TestAggregatorStats(t *testing.T) {
	wp := pool.NetworkerPool(5, 10)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 30*time.Second)

	// Initial stats should be zero
	stats := agg.GetStats()
	if stats.TotalRequests != 0 {
		t.Errorf("Expected 0 total requests, got %d", stats.TotalRequests)
	}

	// Perform aggregation
	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sources := []models.APISource{
		{
			Name:    "Test API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
	}

	_, _ = agg.Aggregate(context.Background(), sources)

	// Stats should be updated
	stats = agg.GetStats()
	if stats.TotalRequests != 1 {
		t.Errorf("Expected 1 total request, got %d", stats.TotalRequests)
	}

	if stats.SuccessfulFetch < 1 {
		t.Errorf("Expected at least 1 successful fetch, got %d", stats.SuccessfulFetch)
	}

	// Reset stats
	agg.ResetStats()
	stats = agg.GetStats()
	if stats.TotalRequests != 0 {
		t.Errorf("Expected 0 total requests after reset, got %d", stats.TotalRequests)
	}
}

func TestAggregatorContextCancellation(t *testing.T) {
	wp := pool.NetworkerPool(5, 10)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 30*time.Second)

	ctx, cancel := context.WithCancel(context.Background())

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sources := []models.APISource{
		{
			Name:    "Test API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
	}

	// Cancel context immediately
	cancel()

	_, err := agg.Aggregate(ctx, sources)
	if err == nil {
		t.Error("Expected error from cancelled context")
	}
}

func TestAggregatorFailedRequests(t *testing.T) {
	wp := pool.NetworkerPool(5, 10)
	defer wp.Shutdown()

	rl := ratelimiter.New(100, 200, true)
	agg := New(wp, rl, 30*time.Second)

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/error" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success": true}`))
	}))
	defer server.Close()

	sources := []models.APISource{
		{
			Name:    "Valid API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
		{
			Name:    "Invalid API",
			URL:     server.URL + "/error",
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
	}

	result, err := agg.Aggregate(context.Background(), sources)
	if err != nil {
		t.Fatalf("Aggregation failed: %v", err)
	}

	if len(result.Results) != 2 {
		t.Errorf("Expected 2 results, got %d", len(result.Results))
	}

	// At least one should succeed
	if result.Success < 1 {
		t.Error("Expected at least one successful request")
	}
}
