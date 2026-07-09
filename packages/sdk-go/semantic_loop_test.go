package rateguard

import (
	"context"
	"fmt"
	"os"
	"testing"
)

// stubEmbedder returns fixed vectors per exact text — mechanics tests
// don't need a real model.
type fixedVecEmbedder struct{ vecs map[string][]float32 }

func (s fixedVecEmbedder) Embed(_ context.Context, text string) ([]float32, error) {
	v, ok := s.vecs[text]
	if !ok {
		return nil, fmt.Errorf("fixed-vec embedder: unknown text %q", text)
	}
	return v, nil
}

func semanticStub() fixedVecEmbedder {
	return fixedVecEmbedder{vecs: map[string][]float32{
		"A":  {1, 0},
		"A'": {0.999, 0.045}, // cosine vs A ≈ 0.999
		"A″": {0.998, 0.06},  // cosine vs A ≈ 0.998
		"B":  {0, 1},
		"C":  {0.7071, 0.7071}, // cosine vs A ≈ 0.707 — related, below threshold
		"Z":  {0, 0},           // zero vector — matches nothing
	}}
}

func TestSemanticLoopDetectorTripsOnParaphrasePingPong(t *testing.T) {
	d := NewSemanticLoopDetector(semanticStub(), SemanticLoopOptions{})
	ctx := context.Background()
	key := "agent-1"

	steps := []struct {
		text     string
		wantLoop bool
	}{
		{"A", false},  // first appearance
		{"B", false},  // other agent's turn
		{"A'", false}, // 1 match — below MinRepeats(2)
		{"B", false},
		{"A″", true}, // matches A and A' — loop
	}
	for i, s := range steps {
		dec, err := d.Check(ctx, key, s.text)
		if err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
		if dec.Loop != s.wantLoop {
			t.Fatalf("step %d (%s): Loop=%v (matches=%d maxSim=%.3f), want %v",
				i, s.text, dec.Loop, dec.Matches, dec.MaxSimilarity, s.wantLoop)
		}
	}
}

func TestSemanticLoopDetectorIgnoresDistinctSteps(t *testing.T) {
	d := NewSemanticLoopDetector(semanticStub(), SemanticLoopOptions{})
	ctx := context.Background()

	for i, text := range []string{"A", "B", "C", "B", "C", "B"} {
		// B repeats — byte-identical steps DO trip semantic detection too
		// (cosine 1.0), which is correct: it subsumes the exact case. Use
		// distinct keys to assert the related-but-different case only.
		if text == "B" {
			continue
		}
		dec, err := d.Check(ctx, "agent-2", text)
		if err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
		if dec.Loop {
			t.Fatalf("step %d (%s): false positive (matches=%d maxSim=%.3f)", i, text, dec.Matches, dec.MaxSimilarity)
		}
	}
}

func TestSemanticLoopPeekNeverRecords(t *testing.T) {
	d := NewSemanticLoopDetector(semanticStub(), SemanticLoopOptions{})
	ctx := context.Background()
	key := "agent-3"

	// Peek the same step 10 times: window must stay empty, never a loop.
	for i := 0; i < 10; i++ {
		dec, err := d.Peek(ctx, key, "A")
		if err != nil {
			t.Fatalf("peek %d: %v", i, err)
		}
		if dec.Loop || dec.Matches != 0 {
			t.Fatalf("peek %d: recorded state leaked (matches=%d)", i, dec.Matches)
		}
	}
	// One real Check still sees an empty window.
	dec, err := d.Check(ctx, key, "A")
	if err != nil {
		t.Fatal(err)
	}
	if dec.Matches != 0 {
		t.Fatalf("Peek polluted the window: matches=%d", dec.Matches)
	}
}

func TestSemanticLoopResetAndWindowBound(t *testing.T) {
	d := NewSemanticLoopDetector(semanticStub(), SemanticLoopOptions{Window: 2, MinRepeats: 2})
	ctx := context.Background()
	key := "agent-4"

	// Fill beyond the window: A, A', then two Bs push the As out.
	for _, s := range []string{"A", "A'", "B", "B"} {
		if _, err := d.Check(ctx, key, s); err != nil {
			t.Fatal(err)
		}
	}
	// Window now holds [B, B] — A″ matches nothing.
	dec, err := d.Check(ctx, key, "A″")
	if err != nil {
		t.Fatal(err)
	}
	if dec.Matches != 0 {
		t.Fatalf("window bound not enforced: matches=%d", dec.Matches)
	}

	d.Reset(key)
	dec, err = d.Check(ctx, key, "A″")
	if err != nil {
		t.Fatal(err)
	}
	if dec.Matches != 0 || dec.Loop {
		t.Fatalf("Reset did not clear window: %+v", dec)
	}
}

func TestSemanticLoopZeroVectorMatchesNothing(t *testing.T) {
	d := NewSemanticLoopDetector(semanticStub(), SemanticLoopOptions{})
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		dec, err := d.Check(ctx, "agent-5", "Z")
		if err != nil {
			t.Fatal(err)
		}
		if dec.Loop || dec.Matches != 0 {
			t.Fatalf("zero vectors must never match: step %d %+v", i, dec)
		}
	}
}

// ── Real-model reproduction (gated) — the documented $47K loop shape ──
//
// Two agents ping-pong the same request in different words every turn.
// SHA-256 fingerprints all differ; the semantic detector must trip.
// RATEGUARD_EMBED_MODEL=/path/to/potion-base-2M.rgemb go test -run RealModel

func TestSemanticLoopRealModelParaphraseLoop(t *testing.T) {
	modelPath := os.Getenv("RATEGUARD_EMBED_MODEL")
	if modelPath == "" {
		t.Skip("RATEGUARD_EMBED_MODEL not set — skipping real-model loop reproduction")
	}
	e, err := LoadStaticEmbedder(modelPath)
	if err != nil {
		t.Fatal(err)
	}
	d := NewSemanticLoopDetector(e, SemanticLoopOptions{})
	ctx := context.Background()
	key := "analyzer-verifier"

	// The ping-pong: an Analyzer keeps re-asking the same thing reworded,
	// a Verifier keeps re-answering the same rejection reworded.
	steps := []string{
		"Please verify the market analysis report for the renewable energy sector.",
		"The analysis is incomplete, send the full market report again for review.",
		"Kindly review and verify the renewable energy sector market analysis report.",
		"This analysis remains incomplete, resend the complete market report for review.",
		"Could you verify the market analysis report on the renewable energy sector?",
	}

	// Every SHA-256 fingerprint must be distinct — proving the exact-match
	// detector is blind to this loop.
	seen := map[string]bool{}
	for _, s := range steps {
		fp := Fingerprint("", s, "")
		if seen[fp] {
			t.Fatalf("test steps must be byte-distinct, got duplicate fingerprint for %q", s)
		}
		seen[fp] = true
	}

	tripped := -1
	for i, s := range steps {
		dec, err := d.Check(ctx, key, s)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("step %d: matches=%d maxSim=%.4f loop=%v — %q", i, dec.Matches, dec.MaxSimilarity, dec.Loop, s)
		if dec.Loop {
			tripped = i
			break
		}
	}
	if tripped == -1 {
		t.Fatal("semantic loop detector never tripped on the reworded ping-pong")
	}
	if tripped > 4 {
		t.Fatalf("tripped too late: step %d", tripped)
	}

	// Control: five genuinely different steps of one task must NOT trip.
	d.Reset(key)
	control := []string{
		"Search the web for current renewable energy market size figures.",
		"Summarize the top three findings from the search results.",
		"Draft an executive summary paragraph from the findings.",
		"Create a table comparing solar and wind capacity growth.",
		"Write the conclusion section referencing the comparison table.",
	}
	for i, s := range control {
		dec, err := d.Check(ctx, "control", s)
		if err != nil {
			t.Fatal(err)
		}
		if dec.Loop {
			t.Fatalf("false positive on distinct step %d (matches=%d maxSim=%.4f): %q", i, dec.Matches, dec.MaxSimilarity, s)
		}
	}
}
