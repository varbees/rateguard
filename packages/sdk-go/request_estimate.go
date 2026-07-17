package rateguard

import (
	"encoding/json"
)

// ── Per-request budget estimation ──
//
// A hard-stop reservation bounds how much budget one in-flight call holds.
// Reserve too little and concurrent callers can collectively overshoot the
// limit; reserve everything and calls serialize.
//
// The outbound transport used to reserve a flat 4096 tokens for every call,
// chosen once at construction — before any request existed. Measured under
// concurrency (token_budget_concurrency_test.go), overshoot is bounded by:
//
//	overshoot <= limit * (actual / estimate)
//
// So the overshoot factor is exactly how wrong the estimate is. A flat 4096 is
// fine for a typical chat call and ~24x wrong for a 100K-token RAG call, which
// makes long-context agents — the workload most able to burn a budget — the
// workload least protected by it. That is backwards, and it is the
// denial-of-wallet hole this file closes.
//
// The transport already buffers the whole request body for model detection and
// fallback retry, and already JSON-parses it (modelFromRequestBody). So the
// prompt is in hand: estimate from what the caller is ACTUALLY sending rather
// than from a constant.
//
//	estimate = tokens(prompt text) + declared output ceiling
//
// Both halves matter. The prompt is measurable exactly. The completion is not
// knowable up front, but the request usually declares its own ceiling
// (max_tokens / max_completion_tokens / maxOutputTokens) — the provider will
// not exceed it, so it is a true upper bound rather than a guess.
//
// Bias: this deliberately OVER-estimates rather than under. Over-reserving
// costs concurrency (calls queue); under-reserving costs money (the budget is
// breached). Only one of those is a security property.
//
// Rule 6 (byte transparency) is preserved: this reads bytes the transport has
// already buffered and never rewrites the request.

// DefaultOutputAllowance is reserved for the completion when a request
// declares no ceiling of its own. Providers default to "until the model
// stops", so there is no true bound to read — this is an allowance, not a
// measurement, and it is the one guess left in the estimate.
const DefaultOutputAllowance = 4096

// MaxEstimateBodyBytes caps the body size this will parse. Beyond it, fall
// back to reserve-all (the safe direction) rather than spend unbounded CPU
// walking a hostile payload on the hot path.
const MaxEstimateBodyBytes = 4 << 20 // 4 MiB

// estimateRequestBody is the request shape across OpenAI-compatible,
// Anthropic, and Gemini APIs. Every field is optional; absent ones cost
// nothing. json.RawMessage defers decoding content, which is polymorphic
// (string or multimodal parts array).
type estimateRequestBody struct {
	// OpenAI chat completions.
	Messages []struct {
		Content json.RawMessage `json:"content"`
	} `json:"messages"`
	// OpenAI legacy completions / embeddings.
	Prompt json.RawMessage `json:"prompt"`
	Input  json.RawMessage `json:"input"`
	// Anthropic: system sits beside messages.
	System json.RawMessage `json:"system"`
	// Google Gemini.
	Contents []struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"contents"`
	SystemInstruction *struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"systemInstruction"`

	// Output ceilings, in the spellings the three families use.
	MaxTokens           *int64 `json:"max_tokens"`
	MaxCompletionTokens *int64 `json:"max_completion_tokens"`
	GenerationConfig    *struct {
		MaxOutputTokens *int64 `json:"maxOutputTokens"`
	} `json:"generationConfig"`
}

// countContent returns the tokens in a content field. The string/typed-parts
// polymorphism is already handled by contentText (semantic_cache.go), which
// this reuses rather than reimplementing — a second decoder would be a second
// thing to drift.
//
// It counts incrementally rather than accumulating the prompt into one string.
// Concatenating first cost a full extra copy of every prompt — measured at 4.7ms
// and 386KB for a 100K-char context, ~4x the body in garbage. Tokens are
// additive, so there is nothing to gain by joining the text first.
//
// Non-text parts (images, audio) are skipped: their token cost is
// provider-specific and not derivable from the request bytes, so the estimate
// under-counts them. Documented in EstimateRequestTokens' contract, not hidden.
func countContent(raw json.RawMessage, tokenizer Tokenizer) int64 {
	if text := contentText(raw); text != "" {
		return int64(EstimateWith(tokenizer, text))
	}
	// The embeddings `input` shape: an array of bare strings, which
	// contentText does not decode (it only knows string | typed parts).
	var strs []string
	if err := json.Unmarshal(raw, &strs); err != nil {
		return 0
	}
	var total int64
	for _, s := range strs {
		total += int64(EstimateWith(tokenizer, s))
	}
	return total
}

// wholeBodyUpperBound estimates an unrecognized request by treating every byte
// as prompt text. The real prompt is a subset of the body, so this cannot
// under-count what the model will read — it over-counts by the JSON structure
// around it, which is the direction that protects the budget.
func wholeBodyUpperBound(body []byte, tokenizer Tokenizer) int64 {
	return int64(EstimateWith(tokenizer, string(body))) + DefaultOutputAllowance
}

// EstimateRequestTokens derives a budget reservation from the request itself:
// measured prompt tokens plus the output ceiling the request declares.
//
// Unknown schemas do NOT fall back to reserve-all. That was the first cut, and
// it was wrong: reserve-all serializes every call on the budget key, so one
// unrecognized request shape would have quietly throttled a whole application
// on upgrade — trading a cost bug for an availability bug.
//
// Instead, an unparseable body is bounded by its own SIZE. The prompt is
// necessarily a subset of the bytes, so estimating the entire body as if it
// were prompt text is a genuine upper bound — it over-counts by the JSON
// scaffolding, which is the safe direction. A 30-byte body cannot hide a
// 100K-token prompt.
//
// Returns 0 ("reserve the entire remaining budget") only for an empty body or
// one too large to walk — both pathological for an LLM call, and serializing
// those is fine.
//
// Non-text modalities (images, audio) are not counted; their cost is not
// derivable from the request bytes. For those workloads set EstimatedTokens
// explicitly.
func EstimateRequestTokens(body []byte, tokenizer Tokenizer) int64 {
	if len(body) == 0 || len(body) > MaxEstimateBodyBytes {
		return 0
	}

	var payload estimateRequestBody
	if err := json.Unmarshal(body, &payload); err != nil {
		return wholeBodyUpperBound(body, tokenizer)
	}

	var input int64
	var sawPrompt bool

	count := func(raw json.RawMessage) {
		if n := countContent(raw, tokenizer); n > 0 {
			input += n
			sawPrompt = true
		}
	}

	for _, m := range payload.Messages {
		count(m.Content)
	}
	count(payload.Prompt)
	count(payload.Input)
	count(payload.System)
	for _, c := range payload.Contents {
		for _, p := range c.Parts {
			if p.Text != "" {
				input += int64(EstimateWith(tokenizer, p.Text))
				sawPrompt = true
			}
		}
	}
	if payload.SystemInstruction != nil {
		for _, p := range payload.SystemInstruction.Parts {
			if p.Text != "" {
				input += int64(EstimateWith(tokenizer, p.Text))
				sawPrompt = true
			}
		}
	}

	if !sawPrompt {
		// Valid JSON carrying no field we recognize as a prompt: a newer API
		// shape, or a provider we have not taught this. Bound it by size
		// rather than serialize the caller.
		return wholeBodyUpperBound(body, tokenizer)
	}

	output := int64(DefaultOutputAllowance)
	switch {
	case payload.MaxCompletionTokens != nil && *payload.MaxCompletionTokens > 0:
		output = *payload.MaxCompletionTokens
	case payload.MaxTokens != nil && *payload.MaxTokens > 0:
		output = *payload.MaxTokens
	case payload.GenerationConfig != nil && payload.GenerationConfig.MaxOutputTokens != nil &&
		*payload.GenerationConfig.MaxOutputTokens > 0:
		output = *payload.GenerationConfig.MaxOutputTokens
	}

	return input + output
}
