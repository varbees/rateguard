package rateguard

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// The outbound transport is the product's headline claim: wrap the HTTP
// client every LLM SDK already uses and get budgets, breakers, fallback,
// and real-usage tracking. These tests drive it end-to-end against mock
// providers, including the streaming shapes real providers emit.

func openAIJSONHandler(model string, prompt, completion int64) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":"cmpl-1","model":%q,"choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":%d,"completion_tokens":%d,"total_tokens":%d}}`,
			model, prompt, completion, prompt+completion)
	}
}

// wrapForHost routes ALL client traffic to the test server while keeping the
// original request Host/URL (so provider detection sees api.openai.com).
func wrapForHost(t *testing.T, sdk *SDK, server *httptest.Server, opts ...OutboundOptions) *http.Client {
	t.Helper()
	inner := &http.Client{Transport: rewriteTransport{target: server}}
	return sdk.WrapClient(inner, opts...)
}

type rewriteTransport struct {
	target *httptest.Server
}

func (rt rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	targetURL := rt.target.URL + req.URL.Path
	parsed, err := http.NewRequest(clone.Method, targetURL, clone.Body)
	if err != nil {
		return nil, err
	}
	parsed.Header = clone.Header
	// Preserve the logical host so the mock can differentiate providers.
	parsed.Header.Set("X-Original-Host", req.URL.Hostname())
	return rt.target.Client().Transport.RoundTrip(parsed)
}

func TestOutboundTracksJSONUsage(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 100, 50))
	defer server.Close()

	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 10000, EstimatedTokensPerRequest: 500})
	client := wrapForHost(t, sdk, server)

	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}`))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("outbound call failed: %v", err)
	}
	defer resp.Body.Close()

	// Caller must receive the full, unmodified body.
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"total_tokens":150`) {
		t.Fatalf("caller body altered or truncated: %s", body)
	}

	// Real usage must land in the budget ledger and metrics.
	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != 150 {
		t.Errorf("tokensConsumed = %d, want 150", consumed)
	}
	if calls := sdk.metrics.outboundCalls.Load(); calls != 1 {
		t.Errorf("outboundCalls = %d, want 1", calls)
	}

	budgetKey := "global:openai:gpt-4o:outbound"
	decision := sdk.tokens.check(budgetKey, sdk.policy)
	if decision.Remaining != 10000-150 {
		t.Errorf("budget remaining = %d, want %d", decision.Remaining, 10000-150)
	}
}

func TestOutboundOpenAIStreamingUsage(t *testing.T) {
	// Real OpenAI shape with stream_options.include_usage: every intermediate
	// chunk carries "usage":null; ONLY the final chunk has real numbers.
	sse := strings.Join([]string{
		`data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"He"}}],"usage":null}`,
		``,
		`data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"llo"}}],"usage":null}`,
		``,
		`data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{}}],"usage":null}`,
		``,
		`data: {"id":"c1","model":"gpt-4o","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":25,"total_tokens":35}}`,
		``,
		`data: [DONE]`,
		``,
	}, "\n")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(sse))
	}))
	defer server.Close()

	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 10000, EstimatedTokensPerRequest: 500})
	client := wrapForHost(t, sdk, server)

	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","stream":true,"stream_options":{"include_usage":true}}`))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("outbound streaming call failed: %v", err)
	}

	// Caller must receive the exact SSE bytes.
	received, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if string(received) != sse {
		t.Fatalf("SSE bytes altered in transit:\nwant: %q\ngot:  %q", sse, received)
	}

	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != 35 {
		t.Errorf("streaming usage not extracted: tokensConsumed = %d, want 35", consumed)
	}
}

func TestOutboundAnthropicStreamingUsage(t *testing.T) {
	// Anthropic splits usage: input tokens in message_start (first event),
	// output tokens in message_delta (last event).
	sse := strings.Join([]string{
		`event: message_start`,
		`data: {"type":"message_start","message":{"id":"m1","model":"claude-sonnet-4","usage":{"input_tokens":42,"output_tokens":1}}}`,
		``,
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","delta":{"text":"Hello"}}`,
		``,
		`event: message_delta`,
		`data: {"type":"message_delta","usage":{"output_tokens":88}}`,
		``,
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(sse))
	}))
	defer server.Close()

	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 10000, EstimatedTokensPerRequest: 500})
	client := wrapForHost(t, sdk, server)

	req, _ := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages",
		strings.NewReader(`{"model":"claude-sonnet-4","stream":true}`))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("outbound streaming call failed: %v", err)
	}
	_, _ = io.ReadAll(resp.Body)
	_ = resp.Body.Close()

	// input 42 + output 88 (merged max across events) = 130.
	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != 130 {
		t.Errorf("anthropic split usage merged wrong: tokensConsumed = %d, want 130", consumed)
	}
}

func TestOutboundStreamingWithoutUsageChargesEstimate(t *testing.T) {
	// OpenAI-compatible streaming WITHOUT stream_options.include_usage: the
	// provider emits content deltas and [DONE] but NO usage anywhere. Real
	// tokens were spent upstream; recording zero would let a runaway agent
	// stream forever without ever touching its budget. The reserved estimate
	// must be committed instead — conservative enforcement, not blindness —
	// and counted as estimated, never as measured usage.
	sse := strings.Join([]string{
		`data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"He"}}]}`,
		``,
		`data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{"content":"llo"}}]}`,
		``,
		`data: {"id":"c1","model":"gpt-4o","choices":[{"delta":{}}]}`,
		``,
		`data: [DONE]`,
		``,
	}, "\n")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(sse))
	}))
	defer server.Close()

	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 10000, EstimatedTokensPerRequest: 500})
	client := wrapForHost(t, sdk, server)

	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","stream":true}`))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("outbound streaming call failed: %v", err)
	}
	received, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if string(received) != sse {
		t.Fatalf("SSE bytes altered in transit")
	}

	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != 0 {
		t.Errorf("no real usage present: tokensConsumed = %d, want 0", consumed)
	}
	if est := sdk.metrics.tokensEstimated.Load(); est != 500 {
		t.Errorf("estimate not charged on missing usage: tokensEstimated = %d, want 500 "+
			"(a streaming call with no usage must charge the budget, not record zero)", est)
	}
}

func TestOutboundBudgetEnforcement(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 400, 100))
	defer server.Close()

	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 600, EstimatedTokensPerRequest: 500})
	client := wrapForHost(t, sdk, server)

	send := func() *http.Response {
		req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
			strings.NewReader(`{"model":"gpt-4o"}`))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("outbound call failed: %v", err)
		}
		_, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		return resp
	}

	// Budget semantics match the inbound middleware and industry practice:
	// calls are allowed while any budget remains (the final call may
	// overshoot, since actual usage is only known after the response),
	// then everything blocks until the window rolls.
	if resp := send(); resp.StatusCode != http.StatusOK {
		t.Fatalf("first call should pass, got %d", resp.StatusCode)
	}
	if resp := send(); resp.StatusCode != http.StatusOK {
		t.Fatalf("second call should pass (100 of 600 budget remains), got %d", resp.StatusCode)
	}
	// Used 1000 of 600 — exhausted.
	resp := send()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("third call should be budget-blocked, got %d", resp.StatusCode)
	}
	if resp.Header.Get("X-RateGuard-Synthesized") != "true" {
		t.Error("blocked response should be marked as synthesized")
	}
	if resp.Header.Get("Retry-After") == "" {
		t.Error("blocked response should carry Retry-After")
	}
}

func TestOutboundObserveModeNeverBlocks(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 400, 100))
	defer server.Close()

	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 100, EstimatedTokensPerRequest: 500})
	client := wrapForHost(t, sdk, server, OutboundOptions{Mode: OutboundModeObserve})

	for i := 0; i < 3; i++ {
		req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
			strings.NewReader(`{"model":"gpt-4o"}`))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("observe-mode call failed: %v", err)
		}
		_, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("observe mode must never block, got %d on call %d", resp.StatusCode, i+1)
		}
	}

	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != 1500 {
		t.Errorf("observe mode should still meter: consumed = %d, want 1500", consumed)
	}
}

func TestOutboundProviderFallback(t *testing.T) {
	var primaryCalls, fallbackCalls atomic.Int64

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "deepseek-chat") {
			fallbackCalls.Add(1)
			if r.Header.Get("Authorization") != "Bearer fallback-key" {
				t.Errorf("fallback must use the fallback provider's credentials, got %q", r.Header.Get("Authorization"))
			}
			openAIJSONHandler("deepseek-chat", 10, 5)(w, r)
			return
		}
		primaryCalls.Add(1)
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"message":"rate limited"}}`))
	}))
	defer server.Close()

	chain := NewProviderChain(
		Provider("openai", "gpt-4o", "https://api.openai.com"),
		ProviderEntry{Name: "deepseek", Model: "deepseek-chat", BaseURL: server.URL, Headers: map[string]string{"Authorization": "Bearer fallback-key"}},
	)

	sdk := New(Config{Preset: "dev"})
	client := wrapForHost(t, sdk, server, OutboundOptions{Chain: chain})

	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[]}`))
	req.Header.Set("Authorization", "Bearer primary-key")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("fallback call failed: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("fallback should succeed, got %d: %s", resp.StatusCode, body)
	}
	if resp.Header.Get("X-RateGuard-Fallback") != "true" {
		t.Error("fallback response missing X-RateGuard-Fallback header")
	}
	if primaryCalls.Load() != 1 || fallbackCalls.Load() != 1 {
		t.Errorf("calls: primary=%d fallback=%d, want 1/1", primaryCalls.Load(), fallbackCalls.Load())
	}
	if fallbacks := sdk.metrics.outboundFallbacks.Load(); fallbacks != 1 {
		t.Errorf("outboundFallbacks = %d, want 1", fallbacks)
	}
}

// TestOutboundFallbackStripsAzureAPIKey reproduces a real credential-leak
// bug: Azure OpenAI authenticates via a bare "api-key" header (not
// "Authorization" or "X-Api-Key"), which retarget's credential-stripping
// list previously missed entirely. Failing over from Azure to another
// provider that doesn't set its own api-key header used to forward the
// Azure key verbatim to that third-party provider.
func TestOutboundFallbackStripsAzureAPIKey(t *testing.T) {
	var fallbackCalls atomic.Int64

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "deepseek-chat") {
			fallbackCalls.Add(1)
			if got := r.Header.Get("api-key"); got != "" {
				t.Errorf("Azure api-key leaked to fallback provider: %q", got)
			}
			openAIJSONHandler("deepseek-chat", 10, 5)(w, r)
			return
		}
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"message":"rate limited"}}`))
	}))
	defer server.Close()

	// The fallback target deliberately does NOT set its own api-key (or
	// any credential header) — the only way this test can fail is if the
	// primary's Azure key leaks through uncleaned.
	chain := NewProviderChain(
		Provider("azure_openai", "gpt-4o", "https://api.openai.com"),
		ProviderEntry{Name: "deepseek", Model: "deepseek-chat", BaseURL: server.URL},
	)

	sdk := New(Config{Preset: "dev"})
	client := wrapForHost(t, sdk, server, OutboundOptions{Chain: chain})

	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[]}`))
	req.Header.Set("api-key", "azure-secret-key")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("fallback call failed: %v", err)
	}
	_ = resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("fallback should succeed, got %d", resp.StatusCode)
	}
	if fallbackCalls.Load() != 1 {
		t.Fatalf("fallbackCalls = %d, want 1", fallbackCalls.Load())
	}
}

// TestOutboundSemanticCacheScopesFallbackResponsesToTheServingProvider
// reproduces a real gap: the semantic cache's scope key was computed from
// the REQUESTED provider/model before execute() ran, but execute() can
// internally fall over to a different provider — which never mutates the
// caller's outboundCall struct (retarget builds an entirely new one for the
// recursive call). Caching a fallback answer under the pre-fallback scope
// meant a later request that reached the ORIGINAL (now-recovered) provider
// could get served the FALLBACK provider's stale, mislabeled answer instead
// of a fresh real one.
func TestOutboundSemanticCacheScopesFallbackResponsesToTheServingProvider(t *testing.T) {
	var primaryCalls, fallbackCalls atomic.Int64
	primaryShouldFail := true

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "deepseek-chat") {
			fallbackCalls.Add(1)
			openAIJSONHandler("deepseek-chat", 10, 5)(w, r)
			return
		}
		primaryCalls.Add(1)
		if primaryShouldFail {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"message":"rate limited"}}`))
			return
		}
		openAIJSONHandler("gpt-4o", 10, 5)(w, r)
	}))
	defer server.Close()

	chain := NewProviderChain(
		Provider("openai", "gpt-4o", "https://api.openai.com"),
		ProviderEntry{Name: "deepseek", Model: "deepseek-chat", BaseURL: server.URL},
	)
	embedder := &stubEmbedder{vectors: map[string][]float32{"capital of france": {1, 0, 0}}}

	sdk := New(Config{Preset: "dev"})
	client := wrapForHost(t, sdk, server, OutboundOptions{
		Chain:         chain,
		SemanticCache: &SemanticCacheOptions{Embedder: embedder, SimilarityThreshold: 0.9},
	})

	// Request 1: primary is down, falls back to deepseek. Gets cached —
	// the fix requires it be cached under deepseek's scope, not openai's.
	req1, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"what is the capital of france?"}]}`))
	resp1, err := client.Do(req1)
	if err != nil {
		t.Fatalf("request 1: %v", err)
	}
	body1, _ := io.ReadAll(resp1.Body)
	_ = resp1.Body.Close()
	if resp1.Header.Get("X-RateGuard-Fallback") != "true" {
		t.Fatalf("request 1 should have fallen back, body: %s", body1)
	}
	if primaryCalls.Load() != 1 || fallbackCalls.Load() != 1 {
		t.Fatalf("after request 1: primary=%d fallback=%d, want 1/1", primaryCalls.Load(), fallbackCalls.Load())
	}

	// Primary has recovered. Request 2 (same prompt, same embedding) must
	// NOT be served deepseek's cached answer as if it were openai's — it
	// must reach the network and get a fresh, real openai response. If the
	// bug were present (cached under "openai:gpt-4o"), this would be a
	// wrongful cache hit: primaryCalls would stay at 1 and the body would
	// still say "deepseek-chat".
	primaryShouldFail = false
	req2, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"tell me the capital of france"}]}`))
	resp2, err := client.Do(req2)
	if err != nil {
		t.Fatalf("request 2: %v", err)
	}
	body2, _ := io.ReadAll(resp2.Body)
	_ = resp2.Body.Close()

	if resp2.Header.Get("X-RateGuard-Cache") == "hit" {
		t.Fatalf("request 2 must not be served from the fallback-scoped cache entry, body: %s", body2)
	}
	if primaryCalls.Load() != 2 {
		t.Fatalf("primary must be reached again on request 2 (recovered): primaryCalls = %d, want 2", primaryCalls.Load())
	}
	if !strings.Contains(string(body2), `"model":"gpt-4o"`) {
		t.Fatalf("request 2 should return a fresh openai (gpt-4o) response, got: %s", body2)
	}
}

func TestOutboundCircuitBreakerTripsPerProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	sdk := New(Config{Preset: "dev", CircuitBreaker: CircuitBreakerOptions{SampleSize: 10, ErrorRateThreshold: 0.5}})
	client := wrapForHost(t, sdk, server)

	var lastStatus int
	for i := 0; i < 15; i++ {
		req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
			strings.NewReader(`{"model":"gpt-4o"}`))
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("call %d errored: %v", i, err)
		}
		_, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		lastStatus = resp.StatusCode
	}

	// After enough failures the breaker opens and the transport synthesizes
	// 503s without hitting the provider.
	if lastStatus != http.StatusServiceUnavailable {
		t.Errorf("breaker should synthesize 503 once open, got %d", lastStatus)
	}
}

func TestOutboundNonLLMTrafficPassesThrough(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("plain"))
	}))
	defer server.Close()

	sdk := New(Config{Preset: "dev"})
	client := sdk.WrapClient(server.Client())

	resp, err := client.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("passthrough failed: %v", err)
	}
	_, _ = io.ReadAll(resp.Body)
	_ = resp.Body.Close()

	if calls := sdk.metrics.outboundCalls.Load(); calls != 0 {
		t.Errorf("non-LLM traffic must not be tracked, outboundCalls = %d", calls)
	}
}

func TestOutboundBedrockConverseUsage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Bedrock Converse uses camelCase usage fields.
		_, _ = w.Write([]byte(`{"output":{"message":{"content":[{"text":"hi"}]}},"usage":{"inputTokens":246,"outputTokens":557,"totalTokens":803}}`))
	}))
	defer server.Close()

	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 10000})
	client := wrapForHost(t, sdk, server)

	req, _ := http.NewRequest(http.MethodPost,
		"https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-sonnet-4/converse",
		strings.NewReader(`{"messages":[]}`))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("bedrock call failed: %v", err)
	}
	_, _ = io.ReadAll(resp.Body)
	_ = resp.Body.Close()

	if consumed := sdk.metrics.tokensConsumed.Load(); consumed != 803 {
		t.Errorf("bedrock camelCase usage not extracted: consumed = %d, want 803", consumed)
	}
}

func TestDetectLLMCallMatrix(t *testing.T) {
	cases := []struct {
		url        string
		provider   string
		compatible bool
		model      string
	}{
		{"https://api.openai.com/v1/chat/completions", "openai", true, ""},
		{"https://api.openai.com/v1/embeddings", "openai", false, ""},
		{"https://api.anthropic.com/v1/messages", "anthropic", false, ""},
		{"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", "google", false, "gemini-2.5-pro"},
		{"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "google", true, ""},
		{"https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/l/publishers/google/models/gemini-2.5-pro:streamGenerateContent", "google_vertex", false, "gemini-2.5-pro"},
		{"https://myres.openai.azure.com/openai/deployments/gpt4o/chat/completions", "azure_openai", true, ""},
		{"https://bedrock-runtime.eu-west-1.amazonaws.com/model/meta.llama3-70b/invoke", "aws_bedrock", false, "meta.llama3-70b"},
		{"https://api.groq.com/openai/v1/chat/completions", "groq", true, ""},
		{"https://api.cerebras.ai/v1/chat/completions", "cerebras", true, ""},
		{"https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "dashscope", true, ""},
		{"https://my-vllm.internal:8000/v1/chat/completions", "my-vllm.internal", true, ""},
		// New providers this round — every path below is the real path shape
		// from that provider's own current API docs, not a guess.
		{"https://api.deepinfra.com/v1/openai/chat/completions", "deepinfra", true, ""},
		{"https://router.huggingface.co/v1/chat/completions", "huggingface", true, ""},
		{"https://inference.baseten.co/v1/chat/completions", "baseten", true, ""},
		{"https://api.tokenfactory.nebius.com/v1/chat/completions", "nebius", true, ""},
		{"https://api.z.ai/api/paas/v4/chat/completions", "zai", true, ""},
		{"https://open.bigmodel.cn/api/paas/v4/chat/completions", "zai", true, ""},
		{"https://api.siliconflow.com/v1/chat/completions", "siliconflow", true, ""},
		{"https://api.siliconflow.cn/v1/chat/completions", "siliconflow", true, ""},
		{"https://router.requesty.ai/v1/chat/completions", "requesty", true, ""},
		{"https://models.github.ai/inference/chat/completions", "github", true, ""},
	}

	for _, tc := range cases {
		req, _ := http.NewRequest(http.MethodPost, tc.url, nil)
		call := detectLLMCall(req)
		if call == nil {
			t.Errorf("%s: not detected", tc.url)
			continue
		}
		if call.Provider != tc.provider {
			t.Errorf("%s: provider = %s, want %s", tc.url, call.Provider, tc.provider)
		}
		if call.Compatible != tc.compatible {
			t.Errorf("%s: compatible = %v, want %v", tc.url, call.Compatible, tc.compatible)
		}
		if tc.model != "" && call.Model != tc.model {
			t.Errorf("%s: model = %s, want %s", tc.url, call.Model, tc.model)
		}
	}

	// Non-LLM URLs must not be detected.
	for _, url := range []string{"https://example.com/api/users", "https://api.stripe.com/v1/charges"} {
		req, _ := http.NewRequest(http.MethodPost, url, nil)
		if detectLLMCall(req) != nil {
			t.Errorf("%s: false positive detection", url)
		}
	}
}
