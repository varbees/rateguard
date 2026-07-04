package rateguard

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// Production-grade means correct under contention, not just in sequence.
// These tests hammer every shared structure from many goroutines and are
// what `go test -race` actually needs to prove thread safety.

func TestConcurrentMiddleware(t *testing.T) {
	sdk := New(Config{
		Preset:                    "high-throughput",
		TokenBudgetPerHour:        1_000_000,
		EstimatedTokensPerRequest: 100,
		LoopDetection:             true,
		Guardrails:                StandardGuardrails(),
	})
	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateGuard-Total-Tokens", "10")
		w.WriteHeader(http.StatusOK)
	}))

	const workers = 32
	const perWorker = 50

	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < perWorker; i++ {
				req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/%d", worker),
					strings.NewReader(`{"prompt":"summarize"}`))
				req.Header.Set("X-Sequence-Depth", "1")
				rec := httptest.NewRecorder()
				handler.ServeHTTP(rec, req)
				if rec.Code != http.StatusOK && rec.Code != http.StatusTooManyRequests {
					t.Errorf("unexpected status %d", rec.Code)
					return
				}
			}
		}(w)
	}
	wg.Wait()

	if total := sdk.metrics.totalRequests.Load(); total != workers*perWorker {
		t.Errorf("totalRequests = %d, want %d", total, workers*perWorker)
	}
}

func TestConcurrentOutboundTransport(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 10, 5))
	defer server.Close()

	sdk := New(Config{Preset: "high-throughput", TokenBudgetPerHour: 10_000_000, EstimatedTokensPerRequest: 50})
	client := wrapForHost(t, sdk, server)

	const workers = 32
	const perWorker = 25

	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < perWorker; i++ {
				req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
					strings.NewReader(`{"model":"gpt-4o"}`))
				resp, err := client.Do(req)
				if err != nil {
					t.Errorf("outbound call failed: %v", err)
					return
				}
				_, _ = io.ReadAll(resp.Body)
				_ = resp.Body.Close()
			}
		}()
	}
	wg.Wait()

	want := int64(workers * perWorker * 15)
	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != want {
		t.Errorf("tokensConsumed = %d, want %d — usage lost under contention", consumed, want)
	}
}

func TestConcurrentMCPAndMetrics(t *testing.T) {
	sdk := New(Config{Preset: "standard", TokenBudgetPerHour: 100_000})
	handler := sdk.HTTPMiddleware(nil)

	var wg sync.WaitGroup
	// Traffic through middleware, MCP queries, and /metrics scrapes at once.
	for w := 0; w < 8; w++ {
		wg.Add(3)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < 40; i++ {
				req := httptest.NewRequest(http.MethodGet, "/api", nil)
				handler.ServeHTTP(httptest.NewRecorder(), req)
			}
		}(w)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < 40; i++ {
				if _, err := sdk.MCPCall("list_limits", map[string]any{"key": fmt.Sprintf("agent-%d", worker)}); err != nil {
					t.Errorf("mcp call failed: %v", err)
					return
				}
			}
		}(w)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < 40; i++ {
				rec := httptest.NewRecorder()
				sdk.Metrics().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
			}
		}(w)
	}
	wg.Wait()
}

func TestConcurrentSSEStreams(t *testing.T) {
	sse := strings.Join([]string{
		`data: {"model":"gpt-4o","choices":[{"delta":{"content":"x"}}],"usage":null}`,
		``,
		`data: {"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}`,
		``,
		`data: [DONE]`,
		``,
	}, "\n")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(sse))
	}))
	defer server.Close()

	sdk := New(Config{Preset: "high-throughput", TokenBudgetPerHour: 1_000_000})
	client := wrapForHost(t, sdk, server)

	const streams = 64
	var wg sync.WaitGroup
	for i := 0; i < streams; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
				strings.NewReader(`{"model":"gpt-4o","stream":true}`))
			resp, err := client.Do(req)
			if err != nil {
				t.Errorf("stream failed: %v", err)
				return
			}
			body, _ := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			if string(body) != sse {
				t.Error("SSE bytes corrupted under concurrency")
			}
		}()
	}
	wg.Wait()

	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != streams*7 {
		t.Errorf("tokensConsumed = %d, want %d", consumed, streams*7)
	}
}
