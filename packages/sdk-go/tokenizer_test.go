package rateguard

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

type tokenEstimateVectors struct {
	Vectors []struct {
		Name           string `json:"name"`
		Text           string `json:"text"`
		ExpectedTokens int    `json:"expected_tokens"`
	} `json:"vectors"`
}

// TestConformanceTokenEstimate replays the shared oracle in
// conformance/token_estimate_vectors.json. A failure means Go's EstimateTokens
// has drifted from Node/Python — the whole point of the CJK-aware heuristic is
// that all three agree on the same string.
func TestConformanceTokenEstimate(t *testing.T) {
	data, err := os.ReadFile("../../conformance/token_estimate_vectors.json")
	if err != nil {
		t.Fatalf("read token estimate vectors: %v", err)
	}
	var v tokenEstimateVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("parse token estimate vectors: %v", err)
	}
	if len(v.Vectors) == 0 {
		t.Fatal("no token estimate vectors loaded")
	}
	for _, vec := range v.Vectors {
		if got := EstimateTokens(vec.Text); got != vec.ExpectedTokens {
			t.Errorf("%s: EstimateTokens(%q) = %d, want %d", vec.Name, vec.Text, got, vec.ExpectedTokens)
		}
	}
}

func TestTokenLimitGuardrailBlocksCJK(t *testing.T) {
	// 40 Chinese chars ~= 40 tokens; a limit of 20 must block. Under the old
	// len(content)/4 (bytes: 120/4 = 30, still > 20 for Go by luck — but on the
	// codepoint truth it is 40) the estimate was language-dependent; now it is
	// the same 40 everywhere.
	guard := NewTokenLimitGuardrail(20)
	if v := guard.Check(strings.Repeat("字", 40)); v == nil || v.Code != "token_limit_exceeded" {
		t.Fatalf("expected token_limit_exceeded on 40 CJK chars, got %v", v)
	}
	// Latin text is unaffected: 40 ASCII chars ~= 10 tokens, under the limit.
	if v := guard.Check(strings.Repeat("a", 40)); v != nil {
		t.Fatalf("expected no violation on 40 ASCII chars, got %v", v)
	}
}

func TestTokenizerCustomOverride(t *testing.T) {
	guard := &TokenLimitGuardrail{MaxTokens: 100, Tokenizer: TokenizerFunc(func(string) int { return 10_000 })}
	if v := guard.Check("hi"); v == nil || v.Code != "token_limit_exceeded" {
		t.Fatalf("custom tokenizer should force a violation, got %v", v)
	}
	if got := EstimateWith(nil, "hello world"); got != EstimateTokens("hello world") {
		t.Fatalf("EstimateWith(nil) should fall back to default, got %d", got)
	}
}
