// Command semantic-cache demonstrates RateGuard's Embedder-based response
// cache: a prompt that means the same thing as one already answered skips
// the network call entirely.
//
// The Embedder here is a toy stand-in — it buckets a prompt into one of a
// few fixed vectors by keyword, purely so the demo is deterministic and
// dependency-free. A real deployment plugs in the OpenAI/Cohere/Voyage
// embeddings API, or a local model — see docs/API_REFERENCE.md.
//
// Run: go run ./examples/semantic-cache
package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	rateguard "github.com/varbees/rateguard/packages/sdk-go"
)

// toyEmbedder buckets prompts by keyword into fixed vectors. Never do this
// in production — it exists only so this example needs no external service.
type toyEmbedder struct{}

func (toyEmbedder) Embed(_ context.Context, text string) ([]float32, error) {
	lower := strings.ToLower(text)
	switch {
	case strings.Contains(lower, "capital") && strings.Contains(lower, "france"):
		return []float32{1, 0, 0}, nil
	case strings.Contains(lower, "weather"):
		return []float32{0, 1, 0}, nil
	default:
		return []float32{0, 0, 1}, nil
	}
}

func main() {
	upstreamCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"Paris."}}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}`)
	}))
	defer server.Close()

	rg := rateguard.New(rateguard.Config{Preset: "standard"})
	client := rg.WrapClient(&http.Client{}, rateguard.OutboundOptions{
		SemanticCache: &rateguard.SemanticCacheOptions{
			Embedder:            toyEmbedder{},
			SimilarityThreshold: 0.9,
		},
	})

	prompts := []string{
		"what is the capital of france?",
		"tell me the capital of France",  // paraphrase of the first — should hit
		"what's the weather like today?", // different topic — should miss
	}

	for _, p := range prompts {
		body := fmt.Sprintf(`{"model":"gpt-4o","messages":[{"role":"user","content":%q}]}`, p)
		req, _ := http.NewRequest(http.MethodPost, server.URL+"/v1/chat/completions", strings.NewReader(body))

		resp, err := client.Do(req)
		if err != nil {
			fmt.Println("call failed:", err)
			continue
		}
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		hit := resp.Header.Get("X-RateGuard-Cache") == "hit"
		fmt.Printf("prompt=%-45q cache_hit=%-5v response=%s\n", p, hit, respBody)
	}

	fmt.Printf("\nreal upstream calls made: %d (of %d prompts — the paraphrase was served from cache)\n", upstreamCalls, len(prompts))
}
