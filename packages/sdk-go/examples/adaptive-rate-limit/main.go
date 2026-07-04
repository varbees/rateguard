// Command adaptive-rate-limit demonstrates the AIMD controller: a flaky
// upstream drives the effective rate limit down, then a healthy upstream
// lets it climb back — no static config change required.
//
// AdjustInterval is set to 1ns so the demo can watch every single request
// move the controller instead of waiting through the 1s production default
// — do not do this in a real deployment, it defeats the point of rate-
// limiting the controller's own adjustments.
//
// Run: go run ./examples/adaptive-rate-limit
package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"time"

	rateguard "github.com/varbees/rateguard/packages/sdk-go"
)

func main() {
	failing := true // the fake upstream starts unhealthy, then recovers
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failing {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	rg := rateguard.New(rateguard.Config{
		Preset:            "standard",
		AdaptiveRateLimit: true,
		Adaptive: rateguard.AdaptiveOptions{
			TargetErrorRate: 0.1,
			AdjustInterval:  time.Nanosecond, // demo-only, see file comment
		},
		// The circuit breaker is a separate, independent line of defense:
		// once it opens it rejects requests before they ever reach the
		// adaptive limiter's outcome hook, starving it of a signal either
		// way. Disabled here so this demo shows the adaptive controller in
		// isolation — in production you'd typically run both together.
		CircuitBreaker: rateguard.CircuitBreakerOptions{Disabled: true},
	})

	handler := rg.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp, err := http.Get(server.URL)
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.WriteHeader(resp.StatusCode)
	}))

	report := func(after int) {
		factor, errRate, _ := rg.AdaptiveRateLimitFactor()
		fmt.Printf("  after %3d requests: factor=%.3f  error_rate_ema=%.3f\n", after, factor, errRate)
	}

	fmt.Println("Phase 1: upstream failing")
	for i := 1; i <= 20; i++ {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
		if i%5 == 0 {
			report(i)
		}
	}

	failing = false
	fmt.Println("\nPhase 2: upstream recovered")
	for i := 1; i <= 60; i++ {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
		if i%15 == 0 {
			report(i)
		}
	}

	fmt.Println("\nThe factor cut to the configured floor while the upstream was failing,")
	fmt.Println("then climbed back once it recovered — the effective rate limit adjusted")
	fmt.Println("itself without any config change.")
}
