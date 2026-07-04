// Command quickstart demonstrates RateGuard's headline feature: wrapping the
// HTTP client your LLM SDK already uses so every call is budgeted, breaker-
// protected, and metered with real token usage.
//
// Self-contained — no API key required. A local httptest server stands in
// for the provider, returning a shape identical to a real OpenAI chat
// completion so RateGuard's usage extraction runs unmodified.
//
// Run: go run ./examples/quickstart
package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	rateguard "github.com/varbees/rateguard/packages/sdk-go"
)

func fakeOpenAIServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"choices":[{"message":{"content":"The capital of France is Paris."}}],
			"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}
		}`)
	}))
}

func main() {
	server := fakeOpenAIServer()
	defer server.Close()

	rg := rateguard.New(rateguard.Config{
		Preset:             "streaming-llm",
		TokenBudgetPerHour: 100_000,
	})

	// One line: every call through this client is tracked.
	client := rg.WrapClient(&http.Client{})

	for i := 1; i <= 3; i++ {
		req, _ := http.NewRequest(http.MethodPost, server.URL+"/v1/chat/completions",
			strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"capital of France?"}]}`))
		// No provider-detection trickery needed: any host serving a path
		// ending in /chat/completions is recognized as a self-hosted
		// OpenAI-compatible endpoint (the same path vLLM/llama.cpp use),
		// so this local test server is tracked exactly like a real one.

		resp, err := client.Do(req)
		if err != nil {
			fmt.Println("call failed:", err)
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		fmt.Printf("call %d: status=%d body=%s\n", i, resp.StatusCode, body)
	}

	fmt.Println()
	fmt.Println("Prometheus metrics:")
	rr := httptest.NewRecorder()
	rg.Metrics().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	for _, line := range strings.Split(rr.Body.String(), "\n") {
		if strings.HasPrefix(line, "rateguard_outbound_calls_total") || strings.HasPrefix(line, "rateguard_tokens_consumed_total") {
			fmt.Println(" ", line)
		}
	}
}
