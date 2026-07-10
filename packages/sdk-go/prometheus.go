package rateguard

import (
	"fmt"
	"net/http"
	"runtime/debug"
	"sync/atomic"
)

// ── Prometheus /metrics endpoint (zero-dependency, stdlib only) ──

// Metrics returns an http.Handler that serves Prometheus-format metrics.
// Sets a permissive CORS header — harmless for a server-side Prometheus
// scraper (which ignores CORS entirely; it's a browser-only restriction),
// and required for the dashboard (packages/dashboard) to read /metrics
// directly from a different origin.
func (s *SDK) Metrics() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		writePrometheusMetrics(w, s)
	})
}

func writePrometheusMetrics(w http.ResponseWriter, s *SDK) {
	p := s.Policy()

	// Rate limiter counters
	promGauge(w, "rateguard_rate_limit_config", 1,
		"preset", p.Name, "rps", fmt.Sprintf("%d", p.RequestsPerSecond), "burst", fmt.Sprintf("%d", p.Burst))

	// Token budget config
	promGauge(w, "rateguard_token_budget_config", 1,
		"preset", p.Name,
		"per_hour", fmt.Sprintf("%d", p.TokenBudgetPerHour),
		"per_day", fmt.Sprintf("%d", p.TokenBudgetPerDay),
		"per_month", fmt.Sprintf("%d", p.TokenBudgetPerMonth),
		"mode", string(p.TokenBudgetMode))

	// Circuit breaker state (0=closed, 1=open, 2=half-open)
	cbState := 0
	if s.breaker != nil {
		switch s.breaker.State() {
		case CircuitBreakerOpen:
			cbState = 1
		case CircuitBreakerHalfOpen:
			cbState = 2
		}
	}
	promGauge(w, "rateguard_circuit_breaker_state", cbState)

	// Runtime counters (incremented on the middleware hot path)
	fmt.Fprint(w, s.metrics.prometheusText())

	// Loop detector state
	if s.loops != nil {
		stats := s.loops.Stats()
		if total, ok := stats["total_fingerprints"].(int); ok {
			promGauge(w, "rateguard_loop_fingerprints", total)
		}
		if halted, ok := stats["halted"].(int); ok {
			promGauge(w, "rateguard_loops_halted", halted)
		}
	}

	// SDK info
	promGauge(w, "rateguard_sdk_info", 1, "version", Version, "language", "go")
}

func promGauge(w http.ResponseWriter, name string, value int, labels ...string) {
	fmt.Fprintf(w, "# HELP %s RateGuard SDK metric\n", name)
	fmt.Fprintf(w, "# TYPE %s gauge\n", name)
	if len(labels) > 0 {
		labelStr := ""
		for i := 0; i < len(labels); i += 2 {
			if i > 0 {
				labelStr += ","
			}
			labelStr += fmt.Sprintf(`%s="%s"`, labels[i], labels[i+1])
		}
		fmt.Fprintf(w, "%s{%s} %d\n", name, labelStr, value)
	} else {
		fmt.Fprintf(w, "%s %d\n", name, value)
	}
}

// Version identifies this build of the SDK for the rateguard_sdk_info
// metric. Overridable via -ldflags for callers building RateGuard itself
// from source; for the common case (RateGuard as an imported dependency)
// it's derived automatically from the Go module version the importer's
// own go.mod pinned, via runtime/debug.ReadBuildInfo — a library has no
// build step of its own for a consumer to pass -ldflags to, so relying on
// that alone left every real user's metrics permanently reporting
// version="dev" regardless of which release they were actually on.
var Version = detectModuleVersion()

func detectModuleVersion() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	const modulePath = "github.com/varbees/rateguard/packages/sdk-go"
	if info.Main.Path == modulePath && info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}
	for _, dep := range info.Deps {
		if dep.Path == modulePath && dep.Version != "" && dep.Version != "(devel)" {
			return dep.Version
		}
	}
	return "dev"
}

// Atomic trackers (increment from middleware hot path)
type atomicMetrics struct {
	totalRequests        atomic.Int64
	rateLimitHits        atomic.Int64
	tokenBudgetExhausted atomic.Int64
	circuitBreakerTrips  atomic.Int64
	tokensConsumed       atomic.Int64
	tokensEstimated      atomic.Int64
	outboundCalls        atomic.Int64
	outboundFallbacks    atomic.Int64
	semanticCacheHits    atomic.Int64
	semanticCacheMisses  atomic.Int64
	guardrailViolations  atomic.Int64
}

func (m *atomicMetrics) prometheusText() string {
	return fmt.Sprintf(
		"# HELP rateguard_requests_total Total requests processed\n"+
			"# TYPE rateguard_requests_total counter\n"+
			"rateguard_requests_total %d\n"+
			"# HELP rateguard_rate_limit_hits_total Rate limit hits\n"+
			"# TYPE rateguard_rate_limit_hits_total counter\n"+
			"rateguard_rate_limit_hits_total %d\n"+
			"# HELP rateguard_token_budget_exhausted_total Token budget exhaustion events\n"+
			"# TYPE rateguard_token_budget_exhausted_total counter\n"+
			"rateguard_token_budget_exhausted_total %d\n"+
			"# HELP rateguard_circuit_breaker_trips_total Circuit breaker trip events\n"+
			"# TYPE rateguard_circuit_breaker_trips_total counter\n"+
			"rateguard_circuit_breaker_trips_total %d\n"+
			"# HELP rateguard_tokens_consumed_total Total tokens consumed (measured from provider usage)\n"+
			"# TYPE rateguard_tokens_consumed_total counter\n"+
			"rateguard_tokens_consumed_total %d\n"+
			"# HELP rateguard_tokens_estimated_total Tokens charged to budgets by estimate when provider usage was unavailable (enable stream include_usage for exact accounting)\n"+
			"# TYPE rateguard_tokens_estimated_total counter\n"+
			"rateguard_tokens_estimated_total %d\n"+
			"# HELP rateguard_outbound_calls_total Total outbound LLM calls tracked\n"+
			"# TYPE rateguard_outbound_calls_total counter\n"+
			"rateguard_outbound_calls_total %d\n"+
			"# HELP rateguard_outbound_fallbacks_total Provider fallback events\n"+
			"# TYPE rateguard_outbound_fallbacks_total counter\n"+
			"rateguard_outbound_fallbacks_total %d\n"+
			"# HELP rateguard_semantic_cache_hits_total Outbound calls served from the semantic cache\n"+
			"# TYPE rateguard_semantic_cache_hits_total counter\n"+
			"rateguard_semantic_cache_hits_total %d\n"+
			"# HELP rateguard_semantic_cache_misses_total Outbound calls that missed the semantic cache\n"+
			"# TYPE rateguard_semantic_cache_misses_total counter\n"+
			"rateguard_semantic_cache_misses_total %d\n"+
			"# HELP rateguard_guardrail_violations_total Content guardrail violations (PII, prompt injection, length)\n"+
			"# TYPE rateguard_guardrail_violations_total counter\n"+
			"rateguard_guardrail_violations_total %d\n",
		m.totalRequests.Load(),
		m.rateLimitHits.Load(),
		m.tokenBudgetExhausted.Load(),
		m.circuitBreakerTrips.Load(),
		m.tokensConsumed.Load(),
		m.tokensEstimated.Load(),
		m.outboundCalls.Load(),
		m.outboundFallbacks.Load(),
		m.semanticCacheHits.Load(),
		m.semanticCacheMisses.Load(),
		m.guardrailViolations.Load(),
	)
}
