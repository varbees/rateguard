package rateguard

import (
	"encoding/json"
	"io"
	"math"
	"os"
	"strings"
	"testing"
)

// conformance/usage_cache_vectors.json is the shared oracle for prompt-cache
// usage: every SDK extracts the same normalised usage from the same bytes and
// prices it to the same cost. Before 0.5.3 Anthropic's input_tokens (which
// excludes cache reads and writes) was taken as the whole prompt, so cached
// tokens priced at $0, and OpenAI's cached tokens priced at the full rate.
type usageCacheVectors struct {
	Cases []struct {
		Name   string `json:"name"`
		Note   string `json:"note"`
		Kind   string `json:"kind"`
		Body   string `json:"body"`
		Model  string `json:"model"`
		Expect struct {
			InputTokens             int64 `json:"input_tokens"`
			OutputTokens            int64 `json:"output_tokens"`
			TotalTokens             int64 `json:"total_tokens"`
			CacheReadTokens         int64 `json:"cache_read_tokens"`
			CacheWriteTokens        int64 `json:"cache_write_tokens"`
			CacheWriteLongTTLTokens int64 `json:"cache_write_long_ttl_tokens"`
		} `json:"expect"`
		ExpectCostUSD float64 `json:"expect_cost_usd"`
	} `json:"cases"`
}

func TestConformanceUsageCache(t *testing.T) {
	data, err := os.ReadFile("../../conformance/usage_cache_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v usageCacheVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Cases) == 0 {
		t.Fatal("no vectors")
	}

	for _, tc := range v.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			var got TokenUsage
			var ok bool
			switch tc.Kind {
			case "json":
				got, ok = extractTokenUsageFromBody([]byte(tc.Body))
			case "sse":
				done := make(chan struct{})
				body := newStreamUsageBody(io.NopCloser(strings.NewReader(tc.Body)), func(u TokenUsage, _ int64, found bool) {
					got, ok = u, found
					close(done)
				}, nil)
				if _, err := io.ReadAll(body); err != nil {
					t.Fatalf("read: %v", err)
				}
				_ = body.Close()
				<-done
			default:
				t.Fatalf("unknown kind %q", tc.Kind)
			}
			if !ok {
				t.Fatalf("no usage extracted (%s)", tc.Note)
			}
			e := tc.Expect
			want := TokenUsage{
				InputTokens: e.InputTokens, OutputTokens: e.OutputTokens, TotalTokens: e.TotalTokens,
				CacheReadTokens: e.CacheReadTokens, CacheWriteTokens: e.CacheWriteTokens,
				CacheWriteLongTTLTokens: e.CacheWriteLongTTLTokens,
			}
			got.Model, got.Provider = "", ""
			if got != want {
				t.Fatalf("usage = %+v\nwant    %+v (%s)", got, want, tc.Note)
			}
			cost := EstimateUsageCost(tc.Model, got)
			if math.Abs(cost-tc.ExpectCostUSD) > 1e-12*math.Max(1, tc.ExpectCostUSD) {
				t.Errorf("cost = %.12f, want %.12f", cost, tc.ExpectCostUSD)
			}
		})
	}
}
