package rateguard

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Semantic caching ──
//
// Exact-match caching misses the common case: two prompts that mean the same
// thing but differ in wording never hit. Semantic caching embeds the prompt
// and serves a prior response when a sufficiently similar prompt was already
// answered — real cost and latency savings on workloads with duplicate
// intent (support bots, agent retries, templated prompts with small
// variations).
//
// RateGuard does not bundle an embedding model. That is a deliberate scope
// decision, not an oversight: an embedding runtime (ONNX, a Python
// microservice, a hosted embeddings API) is exactly the kind of external
// dependency RateGuard's "zero infrastructure, zero added attack surface"
// positioning exists to avoid. Instead, Embedder is a one-method interface —
// bring the OpenAI/Cohere/Voyage embeddings API, a local sentence-transformer
// binding, or anything else that turns text into a vector. RateGuard supplies
// the cache: bounded storage, cosine similarity search, TTL, and the
// transport wiring that skips the network entirely on a hit.
//
// Honest scope: streaming requests (`"stream": true`) are never cached —
// a cached response is a full JSON body, and replaying it as a fabricated
// SSE stream would misrepresent timing (TTFT/TPOT) to the caller. Streaming
// calls always execute for real.

// Embedder turns text into a vector embedding. Implementations decide the
// dimensionality and model; RateGuard only requires that equal-meaning text
// produce vectors with high cosine similarity.
type Embedder interface {
	Embed(ctx context.Context, text string) ([]float32, error)
}

// SemanticCacheOptions configures semantic caching for one outbound
// transport. A nil *SemanticCacheOptions on OutboundOptions disables caching
// entirely (the zero-risk default).
type SemanticCacheOptions struct {
	// Embedder is required — there is no default embedding model.
	Embedder Embedder
	// SimilarityThreshold is the minimum cosine similarity (0-1) for a cache
	// hit. Default 0.92 — conservative; lower it deliberately per workload.
	SimilarityThreshold float64
	// TTL is how long a cached response stays eligible for reuse. Default 1h.
	TTL time.Duration
	// MaxEntriesPerScope bounds memory per provider+model pair. Default 500.
	// Eviction is oldest-first once the bound is hit — this is a cache, not
	// a vector database; workloads needing more should look upstream of
	// RateGuard (Redis, a real vector store) and are out of scope here.
	MaxEntriesPerScope int
}

func (o SemanticCacheOptions) withDefaults() SemanticCacheOptions {
	if o.SimilarityThreshold <= 0 {
		o.SimilarityThreshold = 0.92
	}
	if o.TTL <= 0 {
		o.TTL = time.Hour
	}
	if o.MaxEntriesPerScope <= 0 {
		o.MaxEntriesPerScope = 500
	}
	return o
}

type cachedLLMResponse struct {
	statusCode int
	header     http.Header
	body       []byte
	usage      TokenUsage
}

type semanticCacheEntry struct {
	embedding []float32
	response  cachedLLMResponse
	expiresAt time.Time
}

// semanticCache is the internal engine behind SemanticCacheOptions: a bounded,
// per-scope (provider:model) linear scan over embeddings. Linear scan is
// correct and simple at the size this cache is meant for (hundreds of
// entries per model, not millions) — an ANN index would be premature
// infrastructure for what is meant to be a zero-dependency, in-process cache.
type semanticCache struct {
	opts  SemanticCacheOptions
	clock Clock

	mu     sync.Mutex
	scopes map[string][]*semanticCacheEntry
}

func newSemanticCache(opts SemanticCacheOptions, clock Clock) *semanticCache {
	if clock == nil {
		clock = systemClock{}
	}
	return &semanticCache{
		opts:   opts.withDefaults(),
		clock:  clock,
		scopes: make(map[string][]*semanticCacheEntry),
	}
}

// embed delegates to the configured Embedder.
func (c *semanticCache) embed(ctx context.Context, text string) ([]float32, error) {
	return c.opts.Embedder.Embed(ctx, text)
}

// lookup returns the best matching cached response for embedding in scope,
// if its similarity meets the configured threshold. Expired entries are
// pruned lazily on access.
func (c *semanticCache) lookup(scope string, embedding []float32) (cachedLLMResponse, bool) {
	now := c.clock.Now()

	c.mu.Lock()
	defer c.mu.Unlock()

	entries := c.scopes[scope]
	if len(entries) == 0 {
		return cachedLLMResponse{}, false
	}

	live := entries[:0]
	var best *semanticCacheEntry
	bestScore := -1.0
	for _, e := range entries {
		if now.After(e.expiresAt) {
			continue // pruned: dropped from live
		}
		live = append(live, e)
		if score := cosineSimilarity(embedding, e.embedding); score > bestScore {
			bestScore = score
			best = e
		}
	}
	c.scopes[scope] = live

	if best == nil || bestScore < c.opts.SimilarityThreshold {
		return cachedLLMResponse{}, false
	}
	return best.response, true
}

// store records a fresh response under scope, keyed by its embedding.
// Oldest-first eviction keeps each scope within MaxEntriesPerScope.
func (c *semanticCache) store(scope string, embedding []float32, response cachedLLMResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entries := c.scopes[scope]
	entries = append(entries, &semanticCacheEntry{
		embedding: embedding,
		response:  response,
		expiresAt: c.clock.Now().Add(c.opts.TTL),
	})
	if over := len(entries) - c.opts.MaxEntriesPerScope; over > 0 {
		entries = entries[over:]
	}
	c.scopes[scope] = entries
}

// cosineSimilarity returns the cosine similarity of two equal-length vectors,
// or 0 for mismatched/empty/zero-norm inputs.
func cosineSimilarity(a, b []float32) float64 {
	if len(a) == 0 || len(a) != len(b) {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

// ── Request introspection for caching ──
// (Response usage extraction already exists in sse_usage.go / outbound.go;
// these helpers are cache-specific: "is this cacheable" and "what's the
// prompt text to embed".)

// isStreamingRequestBody reports whether the request body asked for a
// streamed response ("stream": true) — streaming requests are never cached.
func isStreamingRequestBody(body []byte) bool {
	if len(body) == 0 {
		return false
	}
	var payload struct {
		Stream bool `json:"stream"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return false
	}
	return payload.Stream
}

// promptTextFromRequestBody extracts a stable text representation of the
// prompt from an OpenAI- or Anthropic-shaped chat request body, for
// embedding. Multimodal parts other than text (images, audio) are ignored —
// semantic caching only reasons about text content.
func promptTextFromRequestBody(body []byte) string {
	if len(body) == 0 {
		return ""
	}

	var payload struct {
		System   json.RawMessage `json:"system"`
		Messages []struct {
			Role    string          `json:"role"`
			Content json.RawMessage `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}

	var b strings.Builder
	if sys := contentText(payload.System); sys != "" {
		b.WriteString("system: ")
		b.WriteString(sys)
		b.WriteByte('\n')
	}
	for _, m := range payload.Messages {
		text := contentText(m.Content)
		if text == "" {
			continue
		}
		b.WriteString(m.Role)
		b.WriteString(": ")
		b.WriteString(text)
		b.WriteByte('\n')
	}
	return b.String()
}

// contentText decodes an OpenAI/Anthropic "content" field, which is either a
// plain string or an array of typed parts ({"type":"text","text":"..."} plus
// non-text parts this function ignores).
func contentText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}

	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}

	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return ""
	}
	var b strings.Builder
	for _, p := range parts {
		if p.Type == "text" && p.Text != "" {
			if b.Len() > 0 {
				b.WriteByte(' ')
			}
			b.WriteString(p.Text)
		}
	}
	return b.String()
}
