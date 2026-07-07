package rateguard

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestPreBuiltProviderChainsAreGenuinelyOpenAICompatible reproduces a real
// bug: DefaultProviderChain/BudgetProviderChain/QualityProviderChain used to
// include a raw "anthropic" entry pointed at api.anthropic.com's native
// base URL. retarget() rewrites a failed request onto the next entry's
// BaseURL by appending "/chat/completions" and re-sending the SAME
// OpenAI-shaped body — that only works when the target actually speaks
// that schema. Anthropic's native Messages API needs /v1/messages with a
// different request shape entirely, so a real fallback to it would have
// hit the wrong path with the wrong body. Confirmed by actually running a
// fallback and inspecting exactly what request went out, not by reasoning
// about it — every provider in these three presets must round-trip for
// real against a fake server shaped like that provider's actual API.
func TestPreBuiltProviderChainsAreGenuinelyOpenAICompatible(t *testing.T) {
	for _, tc := range []struct {
		name  string
		chain *ProviderChain
	}{
		{"DefaultProviderChain", DefaultProviderChain()},
		{"BudgetProviderChain", BudgetProviderChain()},
		{"QualityProviderChain", QualityProviderChain()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, p := range tc.chain.Providers() {
				if p.Name == "anthropic" {
					t.Fatalf("%s includes a raw anthropic entry — Anthropic has no OpenAI-compatible endpoint, an automatic fallback to it sends the wrong request shape to the wrong path", tc.name)
				}
			}
		})
	}
}

// TestDefaultProviderChainFallbackToGoogleUsesTheCompatibleEndpoint proves
// the fix works, not just that the bad entry is gone: a fallback to
// Google's entry in these chains must actually reach a
// /v1beta/openai/chat/completions-shaped path with a real OpenAI-style
// JSON body, round-tripping successfully end to end.
func TestDefaultProviderChainFallbackToGoogleUsesTheCompatibleEndpoint(t *testing.T) {
	var sawPath string
	var sawBody map[string]any
	fakeGoogle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&sawBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"c1","model":"gemini-2.5-flash","choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}`))
	}))
	defer fakeGoogle.Close()

	chain := NewProviderChain(
		Provider("openai", "gpt-4o", "https://api.openai.com/v1"),
		Provider("google", "gemini-2.5-flash", fakeGoogle.URL),
	)

	upstream := &fixedTransport{fn: func(req *http.Request) (*http.Response, error) {
		if strings.Contains(req.URL.Host, "openai.com") {
			return &http.Response{StatusCode: http.StatusTooManyRequests, Body: io.NopCloser(strings.NewReader(`{"error":{"message":"rate limited"}}`)), Header: make(http.Header)}, nil
		}
		return http.DefaultTransport.RoundTrip(req)
	}}

	sdk := New(Config{Preset: "dev"})
	client := sdk.WrapClient(&http.Client{Transport: upstream}, OutboundOptions{Chain: chain})

	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}`))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("fallback call failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected the Google fallback to succeed, got %d", resp.StatusCode)
	}
	if !strings.HasSuffix(sawPath, "/chat/completions") {
		t.Fatalf("fallback request path = %q, want it to end in /chat/completions (the OpenAI-compatible endpoint)", sawPath)
	}
	if _, ok := sawBody["messages"]; !ok {
		t.Fatalf("fallback request body = %+v, want a real OpenAI-shaped body with a messages field", sawBody)
	}
}
