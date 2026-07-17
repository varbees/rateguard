package rateguard

import (
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

// ── Cross-language conformance: streaming usage extraction ──
//
// Rule 13: parity claims must be conformance-tested, not assumed. These
// vectors exist because Python and Node silently reported NO usage for the
// single-usage-event case (the OpenAI-compatible shape) while Go handled it
// correctly — a real divergence that every per-language suite passed through.
// conformance/sse_usage_vectors.json is the shared oracle.

type sseUsageVectors struct {
	Cases []struct {
		Name               string `json:"name"`
		Note               string `json:"note"`
		SSE                string `json:"sse"`
		ExpectFound        bool   `json:"expect_found"`
		ExpectInputTokens  int64  `json:"expect_input_tokens"`
		ExpectOutputTokens int64  `json:"expect_output_tokens"`
		ExpectTotalTokens  int64  `json:"expect_total_tokens"`
	} `json:"cases"`
}

func TestConformanceSSEUsage(t *testing.T) {
	data, err := os.ReadFile("../../conformance/sse_usage_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v sseUsageVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Cases) == 0 {
		t.Fatal("no vectors")
	}

	for _, tc := range v.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			var gotUsage TokenUsage
			var gotFound bool
			done := make(chan struct{})

			body := newStreamUsageBody(
				io.NopCloser(strings.NewReader(tc.SSE)),
				func(u TokenUsage, _ int64, ok bool) {
					gotUsage, gotFound = u, ok
					close(done)
				},
				nil,
			)

			// Drive the body exactly as a caller would: read it to EOF.
			out, err := io.ReadAll(body)
			if err != nil {
				t.Fatalf("read body: %v", err)
			}
			if err := body.Close(); err != nil {
				t.Fatalf("close body: %v", err)
			}
			<-done

			// Byte transparency: the caller must get the provider's exact bytes.
			if string(out) != tc.SSE {
				t.Errorf("stream bytes were altered in transit")
			}

			if gotFound != tc.ExpectFound {
				t.Fatalf("found = %v, want %v (%s)", gotFound, tc.ExpectFound, tc.Note)
			}
			if !tc.ExpectFound {
				return
			}
			if gotUsage.InputTokens != tc.ExpectInputTokens {
				t.Errorf("input_tokens = %d, want %d", gotUsage.InputTokens, tc.ExpectInputTokens)
			}
			if gotUsage.OutputTokens != tc.ExpectOutputTokens {
				t.Errorf("output_tokens = %d, want %d", gotUsage.OutputTokens, tc.ExpectOutputTokens)
			}
			if gotUsage.TotalTokens != tc.ExpectTotalTokens {
				t.Errorf("total_tokens = %d, want %d", gotUsage.TotalTokens, tc.ExpectTotalTokens)
			}
		})
	}
}
