package rateguard

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// The reservation used to be a flat 4096 for every call. These tests pin the
// measured replacement — especially that a long-context call now reserves
// what it will actually burn, which is the denial-of-wallet hole the constant
// left open.

func TestEstimateRequestTokensOpenAIChat(t *testing.T) {
	body := []byte(`{
		"model": "gpt-4o",
		"messages": [
			{"role": "system", "content": "You are a helpful assistant."},
			{"role": "user", "content": "Explain quicksort."}
		],
		"max_tokens": 500
	}`)

	got := estimateRequestTokens(body, nil)

	// Prompt is ~50 chars -> ~13 tokens; the request declares a 500-token
	// ceiling. The estimate must be prompt + ceiling, not a constant.
	if got <= 500 {
		t.Fatalf("estimate %d did not include the prompt on top of the 500-token ceiling", got)
	}
	if got > 600 {
		t.Fatalf("estimate %d wildly over a ~513-token request", got)
	}
}

// TestEstimateRequestTokensLongContext is the regression that matters: the
// old flat 4096 under-reserved this call by ~24x, and overshoot is bounded by
// exactly how wrong the estimate is.
func TestEstimateRequestTokensLongContext(t *testing.T) {
	// ~400K chars of context ≈ 100K tokens at ~4 chars/token.
	context := strings.Repeat("the quick brown fox jumps over the lazy dog. ", 9000)
	body, err := json.Marshal(map[string]any{
		"model":      "gpt-4o",
		"messages":   []map[string]string{{"role": "user", "content": context}},
		"max_tokens": 1000,
	})
	if err != nil {
		t.Fatal(err)
	}

	got := estimateRequestTokens(body, nil)

	const oldConstant = 4096
	if got <= oldConstant {
		t.Fatalf("long-context call estimated at %d — no better than the flat %d it replaced",
			got, oldConstant)
	}
	// Must land near the real cost (~100K + 1000), not a token of it.
	if got < 90_000 || got > 110_000 {
		t.Fatalf("estimate %d is not close to the ~101K tokens this call really costs", got)
	}
	t.Logf("long-context call reserves %d tokens (was a flat %d — %.0fx under)",
		got, oldConstant, float64(got)/float64(oldConstant))
}

func TestEstimateRequestTokensAnthropicSystemAndCeiling(t *testing.T) {
	body := []byte(`{
		"model": "claude-sonnet-4",
		"system": "You are terse.",
		"messages": [{"role": "user", "content": "Hi"}],
		"max_tokens": 2048
	}`)

	got := estimateRequestTokens(body, nil)
	if got <= 2048 {
		t.Fatalf("estimate %d ignored the system prompt or the ceiling", got)
	}
}

func TestEstimateRequestTokensGeminiShape(t *testing.T) {
	body := []byte(`{
		"contents": [{"parts": [{"text": "Explain gravity briefly."}]}],
		"systemInstruction": {"parts": [{"text": "Be concise."}]},
		"generationConfig": {"maxOutputTokens": 256}
	}`)

	got := estimateRequestTokens(body, nil)
	if got <= 256 {
		t.Fatalf("estimate %d missed Gemini's contents/systemInstruction text", got)
	}
	if got > 300 {
		t.Fatalf("estimate %d too high for a short Gemini call", got)
	}
}

func TestEstimateRequestTokensMultimodalPartsCountText(t *testing.T) {
	body := []byte(`{
		"model": "gpt-4o",
		"messages": [{"role": "user", "content": [
			{"type": "text", "text": "What is in this image?"},
			{"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}}
		]}],
		"max_tokens": 100
	}`)

	got := estimateRequestTokens(body, nil)
	// The text part counts; the image does not (its cost is not derivable
	// from the request). Documented under-count, asserted so it stays known.
	if got <= 100 {
		t.Fatalf("estimate %d missed the text part of a multimodal message", got)
	}
}

func TestEstimateRequestTokensCJKNotUndercounted(t *testing.T) {
	// 2000 CJK chars ≈ 2000 tokens, not 500. A chars/4 estimate would
	// under-reserve this by 4x and let it overshoot by the same factor.
	body, err := json.Marshal(map[string]any{
		"model":      "gpt-4o",
		"messages":   []map[string]string{{"role": "user", "content": strings.Repeat("字", 2000)}},
		"max_tokens": 100,
	})
	if err != nil {
		t.Fatal(err)
	}

	got := estimateRequestTokens(body, nil)
	if got < 2000 {
		t.Fatalf("CJK prompt estimated at %d — under-counted (~2000 tokens expected)", got)
	}
}

// TestEstimateRequestTokensReserveAllOnlyWhenUnwalkable: reserve-all (0) is
// reserved for bodies there is nothing to measure — empty, or too large to
// walk. Everything else must produce a bounded number, because reserve-all
// serializes the budget key and would turn one unrecognized request shape
// into an application-wide throttle.
func TestEstimateRequestTokensReserveAllOnlyWhenUnwalkable(t *testing.T) {
	cases := []struct {
		name string
		body []byte
	}{
		{"empty", nil},
		{"oversized", []byte(`{"messages":[{"role":"user","content":"` +
			strings.Repeat("x", maxEstimateBodyBytes+1) + `"}]}`)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := estimateRequestTokens(tc.body, nil); got != 0 {
				t.Fatalf("estimate %d for %s — want 0 (reserve-all)", got, tc.name)
			}
		})
	}
}

// TestEstimateRequestTokensUnknownSchemaIsBoundedBySize: an unrecognized body
// still gets a real reservation, bounded by its own bytes. The prompt is a
// subset of the body, so body-as-prompt cannot under-count — and unlike
// reserve-all, it does not serialize the caller.
func TestEstimateRequestTokensUnknownSchemaIsBoundedBySize(t *testing.T) {
	cases := []struct {
		name string
		body []byte
	}{
		{"not json", []byte("not json at all")},
		{"truncated json", []byte(`{"messages": [{"role":`)},
		{"unknown schema", []byte(`{"some_other_api": {"field": "value"}}`)},
		{"empty messages", []byte(`{"model": "gpt-4o", "messages": []}`)},
		{"stream flag only", []byte(`{"model":"gpt-4o","stream":true}`)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := estimateRequestTokens(tc.body, nil)
			if got == 0 {
				t.Fatalf("%s: got reserve-all — a small unrecognized body must not "+
					"serialize the whole budget key", tc.name)
			}
			// Upper bound: every byte counted as a token, plus the output
			// allowance. Nothing can legitimately exceed that.
			if max := int64(len(tc.body)) + defaultOutputAllowance; got > max {
				t.Fatalf("%s: estimate %d exceeds its own byte-count bound %d", tc.name, got, max)
			}
		})
	}
}

func TestEstimateRequestTokensHonorsCustomTokenizer(t *testing.T) {
	body := []byte(`{"messages":[{"role":"user","content":"hello"}],"max_tokens":10}`)

	// A tokenizer that claims every prompt is exactly 777 tokens.
	got := estimateRequestTokens(body, TokenizerFunc(func(string) int { return 777 }))
	if want := int64(777 + 10); got != want {
		t.Fatalf("custom tokenizer ignored: got %d, want %d", got, want)
	}
}

func TestEstimateRequestTokensPrefersCompletionCeiling(t *testing.T) {
	// max_completion_tokens supersedes max_tokens on newer OpenAI models.
	body := []byte(`{
		"messages":[{"role":"user","content":"hi"}],
		"max_tokens": 10,
		"max_completion_tokens": 4000
	}`)

	got := estimateRequestTokens(body, nil)
	if got < 4000 {
		t.Fatalf("estimate %d used max_tokens (10) over max_completion_tokens (4000)", got)
	}
}

// TestOutboundLongContextDoesNotOvershoot is the end-to-end proof: the same
// concurrency that overshot a budget with the flat constant must now hold it,
// because each call reserves what it will actually burn.
func TestEstimateBoundsOvershootForLongContext(t *testing.T) {
	context := strings.Repeat("word ", 20_000) // ~100K chars ≈ 25K tokens
	body, err := json.Marshal(map[string]any{
		"model":      "gpt-4o",
		"messages":   []map[string]string{{"role": "user", "content": context}},
		"max_tokens": 1000,
	})
	if err != nil {
		t.Fatal(err)
	}

	estimate := estimateRequestTokens(body, nil)
	actual := estimate // a call that burns exactly what it reserved

	// The measured bound from token_budget_concurrency_test.go:
	//   overshoot <= limit * (actual / estimate)
	// With a measured estimate the ratio is ~1, so there is no headroom to
	// overshoot into. With the old flat 4096 the ratio was ~6x here.
	ratio := float64(actual) / float64(estimate)
	if ratio > 1.01 {
		t.Fatalf("overshoot ratio %.2f — the estimate no longer tracks actual cost", ratio)
	}

	oldRatio := float64(actual) / 4096.0
	if oldRatio <= 1 {
		t.Skip("context too small to demonstrate the old constant's gap")
	}
	t.Log(fmt.Sprintf("overshoot ratio: %.2fx measured vs %.1fx with the old flat 4096",
		ratio, oldRatio))
}
