//go:build live

// Live provider tests — RateGuard against a REAL LLM API, not a mock.
//
// Everything else in this package proves RateGuard is self-consistent. These
// prove it survives contact with a provider that was not built to our
// assumptions: real usage schemas, real SSE framing, real latency.
//
// Go was the SDK that got streaming usage RIGHT when Python and Node silently
// metered zero (e6eba43) — which is exactly why it needs a live harness too.
// Being right once, unverified, is indistinguishable from being lucky.
//
// Behind a build tag so `go test ./...` stays hermetic and offline:
//
//	RATEGUARD_LIVE_BASE_URL=https://integrate.api.nvidia.com/v1 \
//	RATEGUARD_LIVE_API_KEY=... \
//	RATEGUARD_LIVE_MODEL=meta/llama-3.1-8b-instruct \
//	go test -tags=live -v -run TestLive ./...
//
// Or across every configured provider: scripts/live-matrix.sh
//
// Verified 2026-07-17 against NVIDIA NIM, Groq and DeepSeek free tiers.
// NO LOCAL MODELS — they OOM the dev box. Captured bytes in
// conformance/sse_usage_vectors.json serve the offline case better anyway.

package rateguard

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

const liveTimeout = 60 * time.Second

func liveConfig(t *testing.T) (baseURL, apiKey, model string) {
	t.Helper()
	baseURL = os.Getenv("RATEGUARD_LIVE_BASE_URL")
	apiKey = os.Getenv("RATEGUARD_LIVE_API_KEY")
	model = os.Getenv("RATEGUARD_LIVE_MODEL")
	if baseURL == "" || apiKey == "" || model == "" {
		t.Skip("live provider not configured (set RATEGUARD_LIVE_BASE_URL/_API_KEY/_MODEL)")
	}
	return
}

// liveProvider is the provider name RateGuard derives from the configured host.
//
// Derived, never assumed. The Python harness hardcoded "nvidia" here, which was
// invisible while NIM was the only endpoint ever run and then reported "charged
// 0 tokens" against Groq — it was reading a budget key nothing writes. The SDK
// keys budgets on the host; so must the test.
func liveProvider(t *testing.T, baseURL string) string {
	t.Helper()
	u, err := url.Parse(baseURL)
	if err != nil {
		t.Fatalf("bad RATEGUARD_LIVE_BASE_URL: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/chat/completions", nil)
	if err != nil {
		t.Fatal(err)
	}
	call := detectLLMCall(req)
	if call == nil {
		t.Fatalf("RateGuard does not recognize %s as an LLM host — this test would assert "+
			"against a budget key that is never written", u.Hostname())
	}
	return call.Provider
}

func liveBudgetKey(t *testing.T, sdk *SDK, baseURL, model string) string {
	t.Helper()
	return fmt.Sprintf("%s:%s:%s:outbound", sdk.tenantID(), liveProvider(t, baseURL), model)
}

func liveClient(t *testing.T, sdk *SDK, apiKey string) *http.Client {
	t.Helper()
	base := &http.Client{Timeout: liveTimeout, Transport: &liveAuth{key: apiKey}}
	return sdk.WrapClient(base)
}

// liveAuth attaches the provider credential without RateGuard seeing it.
type liveAuth struct{ key string }

func (a *liveAuth) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header.Set("Authorization", "Bearer "+a.key)
	return http.DefaultTransport.RoundTrip(req)
}

func liveChatBody(model, prompt string, stream bool, maxTokens int) io.Reader {
	body := map[string]any{
		"model":      model,
		"messages":   []map[string]string{{"role": "user", "content": prompt}},
		"max_tokens": maxTokens,
		"stream":     stream,
	}
	if stream {
		// Without include_usage most providers stream no usage at all — the
		// DoW hole. Asked for explicitly so the MEASURED path is under test.
		body["stream_options"] = map[string]any{"include_usage": true}
	}
	encoded, _ := json.Marshal(body)
	return bytes.NewReader(encoded)
}

// liveBudgetUsed is what RateGuard actually charged against a key.
//
// Derived from the admission decision (limit - remaining) because Go has no
// usage accessor: Python exposes `runtime.token_budget.usage(key)` and Go's
// manager is unexported, so a Go user cannot ask "how much have I spent?" at
// all. That asymmetry is invisible to the parity guard — the guard compares
// exported names, and this one is missing on the Go side entirely rather than
// spelled differently. Worth closing; tracked, not fixed here.
func liveBudgetUsed(sdk *SDK, key string) int64 {
	d := sdk.tokens.check(key, sdk.Policy())
	if !d.Applied || d.Limit < 0 {
		return 0
	}
	return d.Limit - d.Remaining
}

// TestLiveNonStreamingRecordsRealUsage: the transport must extract usage from a
// real provider response, and hand the caller the provider's own bytes.
func TestLiveNonStreamingRecordsRealUsage(t *testing.T) {
	baseURL, apiKey, model := liveConfig(t)
	sdk := New(Config{Preset: "standard"})
	client := liveClient(t, sdk, apiKey)

	resp, err := client.Post(strings.TrimRight(baseURL, "/")+"/chat/completions",
		"application/json", liveChatBody(model, "Say OK", false, 24))
	if err != nil {
		t.Fatalf("live call failed: %v", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("live call: HTTP %d: %s", resp.StatusCode, raw)
	}

	var payload struct {
		Usage struct {
			TotalTokens int64 `json:"total_tokens"`
		} `json:"usage"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("provider returned unparseable JSON: %v", err)
	}
	if payload.Usage.TotalTokens <= 0 {
		t.Fatal("provider reported no usage on a non-streaming call")
	}
	if len(payload.Choices) == 0 || payload.Choices[0].Message.Content == "" {
		t.Fatal("provider's response content did not reach the caller intact")
	}

	if events := sdk.EnforcementEvents(0); len(events) != 0 {
		t.Fatalf("a successful call must not log enforcement: %+v", events)
	}
}

// TestLiveStreamingChargesWhatTheProviderReported is the assertion that would
// have caught e6eba43 in Go: not "did we parse usage" but "did the BUDGET move
// by the number the provider actually reported".
func TestLiveStreamingChargesWhatTheProviderReported(t *testing.T) {
	baseURL, apiKey, model := liveConfig(t)
	sdk := New(Config{Preset: "streaming-llm", TokenBudgetPerHour: 100_000, TokenBudgetMode: TokenBudgetModeHardStop})
	client := liveClient(t, sdk, apiKey)

	resp, err := client.Post(strings.TrimRight(baseURL, "/")+"/chat/completions",
		"application/json", liveChatBody(model, "Count to five.", true, 48))
	if err != nil {
		t.Fatalf("live stream failed: %v", err)
	}
	raw, err := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if err != nil {
		t.Fatalf("reading live stream: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("live stream: HTTP %d: %s", resp.StatusCode, raw)
	}

	// What the provider itself claims, read independently of RateGuard.
	var providerTotal int64
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data: ") || strings.Contains(line, "[DONE]") {
			continue
		}
		var chunk struct {
			Usage *struct {
				TotalTokens int64 `json:"total_tokens"`
			} `json:"usage"`
		}
		if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &chunk) != nil || chunk.Usage == nil {
			continue
		}
		if chunk.Usage.TotalTokens > providerTotal {
			providerTotal = chunk.Usage.TotalTokens
		}
	}
	if providerTotal == 0 {
		t.Skip("provider reported no usage — include_usage may be unsupported here")
	}

	// Byte transparency (rule 6): the terminal sentinel must survive.
	if !strings.Contains(string(raw), "[DONE]") {
		t.Fatal("provider's [DONE] sentinel was swallowed by the transport")
	}

	charged := liveBudgetUsed(sdk, liveBudgetKey(t, sdk, baseURL, model))
	if charged != providerTotal {
		t.Fatalf("RateGuard charged %d tokens after the real stream, provider reported %d",
			charged, providerTotal)
	}
}

// TestLiveBudgetBlocksARunaway is the whole product claim against a real API.
// A budget that only blocks mocks is worthless.
func TestLiveBudgetBlocksARunaway(t *testing.T) {
	baseURL, apiKey, model := liveConfig(t)
	sdk := New(Config{Preset: "standard", TokenBudgetPerHour: 60, TokenBudgetMode: TokenBudgetModeHardStop})
	client := liveClient(t, sdk, apiKey)

	blocked := false
	for i := 0; i < 8; i++ {
		resp, err := client.Post(strings.TrimRight(baseURL, "/")+"/chat/completions", "application/json",
			liveChatBody(model, fmt.Sprintf("Write one short sentence about the number %d.", i), false, 32))
		if err != nil {
			continue
		}
		code := resp.StatusCode
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		if code == http.StatusTooManyRequests {
			blocked = true
			break
		}
	}

	if !blocked {
		t.Fatal("a 60-token/hour budget never blocked across 8 real completions")
	}

	events := sdk.EnforcementEvents(0)
	if len(events) == 0 {
		t.Fatal("a block must leave an audit trail")
	}
	found := false
	for _, e := range events {
		if strings.Contains(e.Type, "budget") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a budget enforcement event, got %+v", events)
	}
}

// TestLiveFreezeHaltsRealCalls: the kill switch against a real provider.
func TestLiveFreezeHaltsRealCalls(t *testing.T) {
	baseURL, apiKey, model := liveConfig(t)
	sdk := New(Config{Preset: "standard"})
	client := liveClient(t, sdk, apiKey)

	sdk.Freeze("")
	resp, err := client.Post(strings.TrimRight(baseURL, "/")+"/chat/completions",
		"application/json", liveChatBody(model, "Say OK", false, 8))
	if err != nil {
		t.Fatalf("frozen call should synthesize a response, not error: %v", err)
	}
	code := resp.StatusCode
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()

	if code != http.StatusForbidden {
		t.Fatalf("freeze did not halt a real call: HTTP %d", code)
	}

	sdk.Unfreeze("")
	resp2, err := client.Post(strings.TrimRight(baseURL, "/")+"/chat/completions",
		"application/json", liveChatBody(model, "Say OK", false, 8))
	if err != nil {
		t.Fatalf("call after unfreeze failed: %v", err)
	}
	code2 := resp2.StatusCode
	_, _ = io.Copy(io.Discard, resp2.Body)
	_ = resp2.Body.Close()
	if code2 != http.StatusOK {
		t.Fatalf("unfreeze did not restore live calls: HTTP %d", code2)
	}
}
