// Command rateguard-connect is a small reverse proxy that puts RateGuard's
// rate limiting, token budgets, circuit breaker, loop detection, and
// guardrails in front of ANY OpenAI-compatible or Anthropic-compatible LLM
// endpoint — for tools you don't control the source of.
//
// If you own the calling code, use the SDK directly (WrapClient/wrapFetch/
// wrap_httpx_client) instead — zero proxy hop, zero extra process. This
// exists for everything else: a third-party coding agent, a CLI tool, an
// IDE extension — anything that exposes a base_url / API-base override but
// isn't something you can add an import to.
//
// Usage:
//
//	rateguard-connect -upstream https://api.deepseek.com -port 8090
//	rateguard-connect -upstream https://api.anthropic.com -port 8091 -name claude
//
// Then point the tool's base_url override at http://localhost:<port>/v1
// (or, for Anthropic-native tools like Claude Code, at
// http://localhost:<port> — no /v1 suffix; see packages/connect/README.md
// for exact config per tool, and which of these are independently verified
// vs. reported-but-unverified).
//
// Starts permissive and observational by design: soft-stop token budgets,
// generous rate limits. Nothing blocks real traffic until you choose to
// tighten it — via -hard-stop, or live through the dashboard's Controls
// page once you've seen real usage.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	rateguard "github.com/varbees/rateguard/packages/sdk-go"
)

func main() {
	var (
		upstreamFlag = flag.String("upstream", envOr("UPSTREAM_BASE_URL", ""), "upstream base URL to forward to, e.g. https://api.openai.com (required)")
		port         = flag.String("port", envOr("PORT", "8090"), "port to listen on")
		name         = flag.String("name", envOr("NAME", ""), "identity used as the dashboard/admin-API key (default: derived from -upstream's host)")
		rps          = flag.Int("rps", 50, "requests per second")
		burst        = flag.Int("burst", 100, "burst capacity")
		budgetHour   = flag.Int64("budget-hour", 2_000_000, "token budget per hour")
		budgetDay    = flag.Int64("budget-day", 20_000_000, "token budget per day")
		hardStop     = flag.Bool("hard-stop", false, "enforce budgets instead of just observing (default: soft-stop, never blocks)")
	)
	flag.Parse()

	if *upstreamFlag == "" {
		fmt.Fprintln(os.Stderr, "rateguard-connect: -upstream is required (or set UPSTREAM_BASE_URL)")
		flag.Usage()
		os.Exit(2)
	}
	upstream, err := url.Parse(*upstreamFlag)
	if err != nil || upstream.Host == "" {
		log.Fatalf("invalid -upstream %q: %v", *upstreamFlag, err)
	}

	key := deriveKey(*name, upstream.Host)

	mode := rateguard.TokenBudgetModeSoftStop
	if *hardStop {
		mode = rateguard.TokenBudgetModeHardStop
	}

	proxy := httputil.NewSingleHostReverseProxy(upstream)
	proxy.ErrorLog = log.New(os.Stderr, "rateguard-connect: upstream error: ", log.LstdFlags)

	// NewSingleHostReverseProxy rewrites the outgoing URL's scheme/host but
	// leaves the HTTP Host header as the incoming one — CDN-fronted APIs
	// (CloudFront, Cloudflare) commonly reject that mismatch. Fix it.
	defaultDirector := proxy.Director
	proxy.Director = func(r *http.Request) {
		defaultDirector(r)
		r.Host = upstream.Host
	}

	rg := rateguard.New(rateguard.Config{
		Preset:             "high-throughput",
		RequestsPerSecond:  *rps,
		Burst:              *burst,
		TokenBudgetPerHour: *budgetHour,
		TokenBudgetPerDay:  *budgetDay,
		TokenBudgetMode:    mode,
		KeyFunc:            func(*http.Request) string { return key },
		TenantID:           key,
		RouteID:            key,
		UpstreamID:         key,
		Provider:           key,
		Model:              key,
	})

	mux := http.NewServeMux()
	mux.Handle("/metrics", rg.Metrics())
	mux.Handle("/admin/", rg.AdminHandler())
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// A bare visit to "/" has no Authorization header to forward, so the
		// real upstream API would reject it with a confusing vendor-specific
		// error. Serve a real answer instead of proxying a request that was
		// never going to succeed.
		if r.URL.Path == "/" && r.Header.Get("Authorization") == "" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			fmt.Fprintf(w, "rateguard-connect: forwarding to %s\nkey=%s\n\nThis is a reverse proxy, not an API — point a real client's requests here (with its Authorization header) instead of a browser.\nAdmin API: /admin/state?key=%s, /admin/policy, /admin/mcp/tools\nMetrics: /metrics\n", upstream, key, key)
			return
		}
		rg.HTTPMiddleware(proxy).ServeHTTP(w, r)
	})

	addr := ":" + *port
	log.Printf("rateguard-connect listening on %s, forwarding to %s (key=%s, mode=%s)", addr, upstream, key, mode)
	log.Printf("point packages/dashboard at http://localhost%s, key=%s", addr, key)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

// deriveKey picks the dashboard/admin-API key: the explicit -name flag if
// given, otherwise a human-readable label from the upstream host. Most LLM
// providers use the "api.<provider>.com" shape (api.deepseek.com,
// api.anthropic.com, api.openai.com) where the first label is always the
// generic word "api" — so when that's what we see, take the second label
// instead (the actual provider name), falling back to the full host only
// when there's nothing more specific to use.
func deriveKey(nameFlag, upstreamHost string) string {
	if nameFlag != "" {
		return nameFlag
	}
	parts := strings.Split(upstreamHost, ".")
	label := parts[0]
	if label == "api" && len(parts) > 1 {
		label = parts[1]
	}
	if label == "" {
		return upstreamHost
	}
	return label
}
