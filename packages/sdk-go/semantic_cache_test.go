package rateguard

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// stubEmbedder maps known phrases to fixed vectors so similarity is
// deterministic in tests. Unknown text embeds to the zero vector (never
// matches anything, cosine similarity of a zero vector is defined as 0).
type stubEmbedder struct {
	mu    sync.Mutex
	calls int
	// vectors keyed by substring match against the prompt text.
	vectors map[string][]float32
	err     error
}

func (e *stubEmbedder) Embed(_ context.Context, text string) ([]float32, error) {
	e.mu.Lock()
	e.calls++
	e.mu.Unlock()
	if e.err != nil {
		return nil, e.err
	}
	for substr, vec := range e.vectors {
		if strings.Contains(text, substr) {
			return vec, nil
		}
	}
	return []float32{0, 0, 0}, nil
}

func (e *stubEmbedder) callCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.calls
}

func TestCosineSimilarity(t *testing.T) {
	cases := []struct {
		name string
		a, b []float32
		want float64
	}{
		{"identical", []float32{1, 0, 0}, []float32{1, 0, 0}, 1.0},
		{"orthogonal", []float32{1, 0}, []float32{0, 1}, 0.0},
		{"opposite", []float32{1, 0}, []float32{-1, 0}, -1.0},
		{"mismatched length", []float32{1, 0}, []float32{1, 0, 0}, 0.0},
		{"empty", nil, nil, 0.0},
		{"zero vector", []float32{0, 0}, []float32{1, 1}, 0.0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := cosineSimilarity(tc.a, tc.b)
			if diff := got - tc.want; diff > 1e-9 || diff < -1e-9 {
				t.Fatalf("cosineSimilarity(%v, %v) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
		})
	}
}

func TestSemanticCacheHitAboveThreshold(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	c := newSemanticCache(SemanticCacheOptions{SimilarityThreshold: 0.9}, clock)

	stored := cachedLLMResponse{statusCode: 200, body: []byte(`{"ok":true}`)}
	c.store("openai:gpt-4o", []float32{1, 0, 0}, stored)

	got, ok := c.lookup("openai:gpt-4o", []float32{1, 0.01, 0})
	if !ok {
		t.Fatal("expected a hit for a near-identical embedding")
	}
	if string(got.body) != string(stored.body) {
		t.Fatalf("got body %q, want %q", got.body, stored.body)
	}
}

func TestSemanticCacheMissBelowThreshold(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	c := newSemanticCache(SemanticCacheOptions{SimilarityThreshold: 0.95}, clock)

	c.store("openai:gpt-4o", []float32{1, 0, 0}, cachedLLMResponse{statusCode: 200})

	if _, ok := c.lookup("openai:gpt-4o", []float32{0, 1, 0}); ok {
		t.Fatal("orthogonal embedding must not hit")
	}
}

func TestSemanticCacheScopeIsolation(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	c := newSemanticCache(SemanticCacheOptions{SimilarityThreshold: 0.9}, clock)

	c.store("openai:gpt-4o", []float32{1, 0, 0}, cachedLLMResponse{statusCode: 200, body: []byte("gpt-4o")})

	if _, ok := c.lookup("anthropic:claude-opus-4-5", []float32{1, 0, 0}); ok {
		t.Fatal("identical embedding in a different provider:model scope must not hit")
	}
}

func TestSemanticCacheExpiry(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	c := newSemanticCache(SemanticCacheOptions{SimilarityThreshold: 0.9, TTL: time.Minute}, clock)

	c.store("openai:gpt-4o", []float32{1, 0, 0}, cachedLLMResponse{statusCode: 200})

	if _, ok := c.lookup("openai:gpt-4o", []float32{1, 0, 0}); !ok {
		t.Fatal("expected a hit before expiry")
	}

	clock.advance(2 * time.Minute)
	if _, ok := c.lookup("openai:gpt-4o", []float32{1, 0, 0}); ok {
		t.Fatal("expired entry must not hit")
	}
}

func TestSemanticCacheBoundedEviction(t *testing.T) {
	clock := &fakeLimiterClock{now: time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)}
	c := newSemanticCache(SemanticCacheOptions{SimilarityThreshold: 0.999, MaxEntriesPerScope: 3}, clock)

	// Four orthogonal-ish entries in a 4-D space, each store distinct.
	c.store("s", []float32{1, 0, 0, 0}, cachedLLMResponse{body: []byte("a")})
	c.store("s", []float32{0, 1, 0, 0}, cachedLLMResponse{body: []byte("b")})
	c.store("s", []float32{0, 0, 1, 0}, cachedLLMResponse{body: []byte("c")})
	c.store("s", []float32{0, 0, 0, 1}, cachedLLMResponse{body: []byte("d")})

	// Oldest ("a") must have been evicted; newest ("d") must still be present.
	if _, ok := c.lookup("s", []float32{1, 0, 0, 0}); ok {
		t.Fatal("oldest entry should have been evicted at capacity 3")
	}
	if _, ok := c.lookup("s", []float32{0, 0, 0, 1}); !ok {
		t.Fatal("newest entry must survive eviction")
	}
}

func TestPromptTextFromRequestBodyOpenAIShape(t *testing.T) {
	body := []byte(`{"model":"gpt-4o","messages":[
		{"role":"system","content":"You are terse."},
		{"role":"user","content":"What is 2+2?"}
	]}`)
	got := promptTextFromRequestBody(body)
	if !strings.Contains(got, "You are terse.") || !strings.Contains(got, "What is 2+2?") {
		t.Fatalf("prompt extraction missed content: %q", got)
	}
}

func TestPromptTextFromRequestBodyMultimodalParts(t *testing.T) {
	body := []byte(`{"messages":[{"role":"user","content":[
		{"type":"text","text":"describe this"},
		{"type":"image_url","image_url":{"url":"https://example.com/x.png"}}
	]}]}`)
	got := promptTextFromRequestBody(body)
	if !strings.Contains(got, "describe this") {
		t.Fatalf("expected text part extracted, got %q", got)
	}
	if strings.Contains(got, "example.com") {
		t.Fatalf("image part must be ignored, got %q", got)
	}
}

func TestPromptTextFromRequestBodyAnthropicSystemField(t *testing.T) {
	body := []byte(`{"model":"claude-opus-4-5","system":"Be concise.","messages":[
		{"role":"user","content":"hello"}
	]}`)
	got := promptTextFromRequestBody(body)
	if !strings.Contains(got, "Be concise.") || !strings.Contains(got, "hello") {
		t.Fatalf("expected system + message content, got %q", got)
	}
}

func TestIsStreamingRequestBody(t *testing.T) {
	if isStreamingRequestBody([]byte(`{"model":"gpt-4o","stream":true}`)) != true {
		t.Fatal("stream:true must be detected")
	}
	if isStreamingRequestBody([]byte(`{"model":"gpt-4o","stream":false}`)) != false {
		t.Fatal("stream:false must not be detected as streaming")
	}
	if isStreamingRequestBody([]byte(`{"model":"gpt-4o"}`)) != false {
		t.Fatal("absent stream field must default to non-streaming")
	}
	if isStreamingRequestBody(nil) != false {
		t.Fatal("empty body must not be treated as streaming")
	}
}

// ── Transport-level integration ──

type fixedTransport struct {
	mu    sync.Mutex
	calls int
	fn    func(*http.Request) (*http.Response, error)
}

func (f *fixedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	return f.fn(req)
}

func (f *fixedTransport) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func jsonOKResponse(req *http.Request, payload string) *http.Response {
	header := http.Header{}
	header.Set("Content-Type", "application/json")
	return &http.Response{
		StatusCode:    http.StatusOK,
		Header:        header,
		Body:          io.NopCloser(strings.NewReader(payload)),
		ContentLength: int64(len(payload)),
		Request:       req,
	}
}

func openAIChatRequest(t *testing.T, prompt string) *http.Request {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"model":    "gpt-4o",
		"messages": []map[string]string{{"role": "user", "content": prompt}},
	})
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions", strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	return req
}

func TestOutboundSemanticCacheHitSkipsNetwork(t *testing.T) {
	upstream := &fixedTransport{fn: func(req *http.Request) (*http.Response, error) {
		return jsonOKResponse(req, `{"choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}`), nil
	}}
	embedder := &stubEmbedder{vectors: map[string][]float32{"capital of france": {1, 0, 0}}}

	sdk := New(Config{Preset: "standard"})
	client := sdk.WrapClient(&http.Client{Transport: upstream}, OutboundOptions{
		SemanticCache: &SemanticCacheOptions{Embedder: embedder, SimilarityThreshold: 0.9},
	})

	req1 := openAIChatRequest(t, "what is the capital of france?")
	resp1, err := client.Do(req1)
	if err != nil {
		t.Fatal(err)
	}
	resp1.Body.Close()
	if resp1.Header.Get("X-RateGuard-Cache") == "hit" {
		t.Fatal("first call must be a real miss")
	}
	if upstream.callCount() != 1 {
		t.Fatalf("expected 1 upstream call after first request, got %d", upstream.callCount())
	}

	req2 := openAIChatRequest(t, "tell me the capital of france")
	resp2, err := client.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	body2, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()

	if resp2.Header.Get("X-RateGuard-Cache") != "hit" {
		t.Fatal("similar second prompt must be served from cache")
	}
	if upstream.callCount() != 1 {
		t.Fatalf("cache hit must not reach upstream: calls = %d", upstream.callCount())
	}
	if !strings.Contains(string(body2), `"content":"hi"`) {
		t.Fatalf("cached body mismatch: %s", body2)
	}
}

func TestOutboundSemanticCacheStreamingBypassesCache(t *testing.T) {
	calls := 0
	upstream := &fixedTransport{fn: func(req *http.Request) (*http.Response, error) {
		calls++
		return jsonOKResponse(req, `data: [DONE]`), nil
	}}
	embedder := &stubEmbedder{}

	sdk := New(Config{Preset: "standard"})
	client := sdk.WrapClient(&http.Client{Transport: upstream}, OutboundOptions{
		SemanticCache: &SemanticCacheOptions{Embedder: embedder},
	})

	body, _ := json.Marshal(map[string]any{
		"model": "gpt-4o", "stream": true,
		"messages": []map[string]string{{"role": "user", "content": "hello"}},
	})
	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions", strings.NewReader(string(body)))
	req2, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions", strings.NewReader(string(body)))

	if _, err := client.Do(req); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Do(req2); err != nil {
		t.Fatal(err)
	}

	if embedder.callCount() != 0 {
		t.Fatalf("streaming requests must never be embedded, got %d calls", embedder.callCount())
	}
	if calls != 2 {
		t.Fatalf("streaming requests must always hit the network, got %d calls", calls)
	}
}

func TestOutboundSemanticCacheEmbedderFailureDegradesToRealCall(t *testing.T) {
	upstream := &fixedTransport{fn: func(req *http.Request) (*http.Response, error) {
		return jsonOKResponse(req, `{"ok":true}`), nil
	}}
	embedder := &stubEmbedder{err: errors.New("embedding service down")}

	sdk := New(Config{Preset: "standard"})
	client := sdk.WrapClient(&http.Client{Transport: upstream}, OutboundOptions{
		SemanticCache: &SemanticCacheOptions{Embedder: embedder},
	})

	resp, err := client.Do(openAIChatRequest(t, "hello"))
	if err != nil {
		t.Fatalf("embedder failure must not fail the request: %v", err)
	}
	resp.Body.Close()
	if upstream.callCount() != 1 {
		t.Fatalf("expected the real call to proceed, got %d upstream calls", upstream.callCount())
	}
}

func TestOutboundSemanticCacheNeverCachesNonOKResponses(t *testing.T) {
	upstream := &fixedTransport{fn: func(req *http.Request) (*http.Response, error) {
		header := http.Header{}
		header.Set("Content-Type", "application/json")
		payload := `{"error":"upstream unavailable"}`
		return &http.Response{
			StatusCode:    http.StatusInternalServerError,
			Header:        header,
			Body:          io.NopCloser(strings.NewReader(payload)),
			ContentLength: int64(len(payload)),
			Request:       req,
		}, nil
	}}
	embedder := &stubEmbedder{vectors: map[string][]float32{"hello": {1, 0, 0}}}

	sdk := New(Config{Preset: "standard"})
	client := sdk.WrapClient(&http.Client{Transport: upstream}, OutboundOptions{
		SemanticCache: &SemanticCacheOptions{Embedder: embedder, SimilarityThreshold: 0.9},
		Chain:         nil, // no fallback — the 500 must surface, not be retried away
	})

	for i := 0; i < 2; i++ {
		resp, err := client.Do(openAIChatRequest(t, "hello there"))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
	}

	if upstream.callCount() != 2 {
		t.Fatalf("a 500 response must never be cached — expected 2 upstream calls, got %d", upstream.callCount())
	}
}
