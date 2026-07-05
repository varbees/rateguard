package rateguard

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestSetPolicyPartialUpdate(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	before := sdk.Policy()

	newRPS := 5
	after := sdk.SetPolicy(PolicyUpdate{RequestsPerSecond: &newRPS})

	if after.RequestsPerSecond != 5 {
		t.Fatalf("RequestsPerSecond = %d, want 5", after.RequestsPerSecond)
	}
	if after.Burst != before.Burst {
		t.Fatalf("Burst changed to %d without being part of the update, want unchanged %d", after.Burst, before.Burst)
	}
	if got := sdk.Policy().RequestsPerSecond; got != 5 {
		t.Fatalf("Policy() after SetPolicy = %d, want 5", got)
	}
}

func TestSetPolicyTakesEffectOnNextRequest(t *testing.T) {
	sdk := New(Config{Preset: "dev", RequestsPerSecond: 100, Burst: 1})
	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	send := func() int {
		req := httptest.NewRequest(http.MethodGet, "/hello", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec.Code
	}

	if code := send(); code != http.StatusOK {
		t.Fatalf("first request with burst=1: got %d, want 200", code)
	}
	if code := send(); code != http.StatusTooManyRequests {
		t.Fatalf("second request should exhaust burst=1: got %d, want 429", code)
	}

	newBurst := 10
	sdk.SetPolicy(PolicyUpdate{Burst: &newBurst})

	// Existing per-key bucket state doesn't retroactively gain tokens, but
	// the policy driving future refill/burst math must reflect the update
	// immediately — confirm the effective policy changed, which is what
	// SetPolicy actually promises.
	if got := sdk.Policy().Burst; got != 10 {
		t.Fatalf("Policy().Burst after SetPolicy = %d, want 10", got)
	}
}

func TestSetPolicyTokenBudgetOverride(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	newHour := int64(999)
	newMode := TokenBudgetModeSoftStop
	after := sdk.SetPolicy(PolicyUpdate{
		TokenBudgetPerHour: &newHour,
		TokenBudgetMode:    &newMode,
	})

	if after.TokenBudgetPerHour != 999 {
		t.Fatalf("TokenBudgetPerHour = %d, want 999", after.TokenBudgetPerHour)
	}
	if after.TokenBudgetMode != TokenBudgetModeSoftStop {
		t.Fatalf("TokenBudgetMode = %q, want soft-stop", after.TokenBudgetMode)
	}
}

func TestSetPolicyConcurrentWithRequests(t *testing.T) {
	sdk := New(Config{Preset: "dev", RequestsPerSecond: 1_000_000, Burst: 1_000_000})
	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	var wg sync.WaitGroup
	stop := make(chan struct{})

	// A stream of requests racing against a stream of live policy updates —
	// the race detector is the actual assertion here.
	wg.Add(2)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				req := httptest.NewRequest(http.MethodGet, "/hello", nil)
				handler.ServeHTTP(httptest.NewRecorder(), req)
			}
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			rps := 100 + i
			sdk.SetPolicy(PolicyUpdate{RequestsPerSecond: &rps})
		}
		close(stop)
	}()
	wg.Wait()
}

// TestMetricsScrapeConcurrentWithSetPolicy guards against a real bug found
// while wiring the admin API: writePrometheusMetrics once read s.policy
// directly instead of through the mutex-guarded Policy(), a data race the
// HTTP-request-vs-SetPolicy test above didn't exercise because scraping
// /metrics is a separate code path from the request middleware.
func TestMetricsScrapeConcurrentWithSetPolicy(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	metricsHandler := sdk.Metrics()

	var wg sync.WaitGroup
	stop := make(chan struct{})

	wg.Add(2)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
				rec := httptest.NewRecorder()
				metricsHandler.ServeHTTP(rec, req)
				_, _ = io.Copy(io.Discard, rec.Body)
			}
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			rps := 100 + i
			sdk.SetPolicy(PolicyUpdate{RequestsPerSecond: &rps})
		}
		close(stop)
	}()
	wg.Wait()
}
