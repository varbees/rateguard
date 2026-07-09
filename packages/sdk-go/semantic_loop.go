package rateguard

import (
	"context"
	"math"
	"sync"
)

// ── Semantic Loop Detection — catching the paraphrase loop ──
//
// SHA-256 fingerprinting (loop_detector.go) catches an agent repeating
// itself byte-for-byte. It provably cannot catch the loop that actually
// produced the documented $47K incident: two agents ping-ponging messages
// that were semantically identical but worded differently on every turn.
//
// SemanticLoopDetector closes that gap: it embeds each step locally (see
// static_embedder.go — no network, no inference runtime) and compares the
// incoming step against a sliding window of the sequence's recent steps.
// Enough near-duplicates inside the window means the agent is circling —
// halt it before the budget goes.
//
// This is a complement to, not a replacement for, the exact-match
// detector: hashing is free and catches byte-identical repeats instantly;
// embedding costs one lookup+pool per step (~microseconds) and catches
// the reworded ones.
//
// Defaults are calibrated against measured potion-base-2M cosine
// separations (2026-07-09, see semantic_loop_test.go's real-model test):
// tight paraphrases of one ask score 0.92-0.99; enumeration workloads
// (same template, different entity: "weather in Paris"/"in London") top
// out near 0.80; genuinely distinct task steps stay under 0.67. The 0.90
// default threshold sits in the gap: it trips reworded loops within a
// couple of repeats and stays silent on enumeration.
//
// Honest limitation: loosely reworded repeats (measured 0.73-0.86) are
// indistinguishable from enumeration at this model size and will NOT be
// caught by the default — lowering the threshold below ~0.85 trades that
// for false positives on template workloads. A larger model (e.g.
// potion-base-8M) widens the gap.

const (
	defaultSemanticLoopWindow     = 8
	defaultSemanticLoopThreshold  = 0.90
	defaultSemanticLoopMinRepeats = 2
	defaultSemanticLoopMaxKeys    = 10000
)

// SemanticLoopOptions configures a SemanticLoopDetector.
type SemanticLoopOptions struct {
	// Window is how many recent steps per key are kept for comparison.
	// Default 8.
	Window int
	// Threshold is the cosine similarity at or above which two steps count
	// as the same step reworded. Default 0.90 — measured to separate
	// reworded repeats (0.92+) from same-template/different-entity steps
	// (≤0.80) on potion-base-2M; see the package comment for the data.
	Threshold float64
	// MinRepeats is how many window entries must match the incoming step
	// for it to be declared a loop. Default 2 — a two-agent ping-pong
	// (A→B→A'→B'→A″) trips on the third appearance of the same content.
	MinRepeats int
	// MaxKeys bounds how many distinct sequence keys are tracked (LRU).
	// Default 10000.
	MaxKeys int
}

func (o SemanticLoopOptions) withDefaults() SemanticLoopOptions {
	if o.Window <= 0 {
		o.Window = defaultSemanticLoopWindow
	}
	if o.Threshold <= 0 {
		o.Threshold = defaultSemanticLoopThreshold
	}
	if o.MinRepeats <= 0 {
		o.MinRepeats = defaultSemanticLoopMinRepeats
	}
	if o.MaxKeys <= 0 {
		o.MaxKeys = defaultSemanticLoopMaxKeys
	}
	return o
}

// SemanticLoopDecision is the outcome of a semantic loop check.
type SemanticLoopDecision struct {
	// Loop is true when the incoming step matched MinRepeats or more of
	// the recent window at or above Threshold.
	Loop bool
	// Matches is how many window entries matched.
	Matches int
	// MaxSimilarity is the highest cosine similarity observed against the
	// window (0 when the window is empty).
	MaxSimilarity float64
}

type semanticWindow struct {
	vecs [][]float32 // ring buffer, oldest first
}

// SemanticLoopDetector detects reworded agent loops via local embeddings.
// Safe for concurrent use.
type SemanticLoopDetector struct {
	mu       sync.Mutex
	embedder Embedder
	opts     SemanticLoopOptions
	windows  *boundedCache[string, *semanticWindow]
}

// NewSemanticLoopDetector creates a detector. The embedder is required —
// pair it with LoadStaticEmbedder for fully local detection, or bring any
// Embedder implementation.
func NewSemanticLoopDetector(embedder Embedder, opts SemanticLoopOptions) *SemanticLoopDetector {
	o := opts.withDefaults()
	return &SemanticLoopDetector{
		embedder: embedder,
		opts:     o,
		windows:  newBoundedCache[string, *semanticWindow](o.MaxKeys),
	}
}

// Check embeds the step, compares it against the key's recent window, and
// records it for future checks. Recording happens regardless of the
// decision so an operator who chooses to continue past a warning still
// has an accurate window.
func (d *SemanticLoopDetector) Check(ctx context.Context, key, stepText string) (SemanticLoopDecision, error) {
	return d.evaluate(ctx, key, stepText, true)
}

// Peek is the non-consuming pre-flight variant: same decision, but the
// step is NOT recorded into the window. Rule: pre-flight queries never
// mutate state.
func (d *SemanticLoopDetector) Peek(ctx context.Context, key, stepText string) (SemanticLoopDecision, error) {
	return d.evaluate(ctx, key, stepText, false)
}

// Reset forgets a key's window — call when a sequence legitimately
// restarts.
func (d *SemanticLoopDetector) Reset(key string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.windows.delete(key)
}

func (d *SemanticLoopDetector) evaluate(ctx context.Context, key, stepText string, record bool) (SemanticLoopDecision, error) {
	vec, err := d.embedder.Embed(ctx, stepText)
	if err != nil {
		return SemanticLoopDecision{}, err
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	w, ok := d.windows.get(key)
	if !ok {
		w = &semanticWindow{}
	}

	decision := SemanticLoopDecision{}
	for _, prev := range w.vecs {
		sim := cosineSimilarity32(vec, prev)
		if sim > decision.MaxSimilarity {
			decision.MaxSimilarity = sim
		}
		if sim >= d.opts.Threshold {
			decision.Matches++
		}
	}
	decision.Loop = decision.Matches >= d.opts.MinRepeats

	if record {
		w.vecs = append(w.vecs, vec)
		if len(w.vecs) > d.opts.Window {
			w.vecs = w.vecs[len(w.vecs)-d.opts.Window:]
		}
		d.windows.set(key, w)
	}
	return decision, nil
}

// cosineSimilarity32 computes cosine similarity in float64, tolerating
// unnormalized and zero vectors (a zero vector matches nothing).
func cosineSimilarity32(a, b []float32) float64 {
	n := min(len(a), len(b))
	var dot, na, nb float64
	for i := range n {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
