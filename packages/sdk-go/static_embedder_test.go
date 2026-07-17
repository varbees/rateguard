package rateguard

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Mini-model tests (always run) ──
// A tiny hand-built .rgemb exercises the loader, the full tokenizer
// pipeline, and the pooling math without needing the real 8MB model.

// buildMiniRGEMB serializes a valid .rgemb v1 with the given vocab and
// per-token embedding rows.
func buildMiniRGEMB(t *testing.T, vocab []string, dim int, rows [][]float32, normalize bool) []byte {
	t.Helper()
	header := map[string]any{
		"format":         "rgemb/1",
		"source":         "mini-test",
		"dim":            dim,
		"vocab_size":     len(vocab),
		"dtype":          "f32",
		"normalize":      normalize,
		"norm_epsilon":   1e-32,
		"drop_token_ids": []int32{1},
		"tokenizer": map[string]any{
			"type":                      "wordpiece",
			"lowercase":                 true,
			"strip_accents":             true,
			"clean_text":                true,
			"handle_chinese_chars":      true,
			"continuing_subword_prefix": "##",
			"unk_id":                    1,
			"max_input_chars_per_word":  10,
		},
	}
	hb, err := json.Marshal(header)
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	var buf bytes.Buffer
	buf.WriteString(rgembMagic)
	_ = binary.Write(&buf, binary.LittleEndian, uint32(len(hb)))
	buf.Write(hb)
	for _, tok := range vocab {
		_ = binary.Write(&buf, binary.LittleEndian, uint16(len(tok)))
		buf.WriteString(tok)
	}
	for _, row := range rows {
		if len(row) != dim {
			t.Fatalf("row width %d != dim %d", len(row), dim)
		}
		_ = binary.Write(&buf, binary.LittleEndian, row)
	}
	return buf.Bytes()
}

func miniEmbedder(t *testing.T) *StaticEmbedder {
	t.Helper()
	// ids:          0        1        2        3       4      5       6     7
	vocab := []string{"[PAD]", "[UNK]", "hello", "world", "##ld", "wor", "cafe", "!"}
	rows := [][]float32{
		{0, 0}, {9, 9}, {1, 0}, {0, 1}, {0.5, 0.5}, {2, 0}, {0, 2}, {1, 1},
	}
	e, err := ReadStaticEmbedder(bytes.NewReader(buildMiniRGEMB(t, vocab, 2, rows, true)))
	if err != nil {
		t.Fatalf("load mini model: %v", err)
	}
	return e
}

func TestStaticEmbedderTokenizePipeline(t *testing.T) {
	e := miniEmbedder(t)
	cases := []struct {
		name string
		in   string
		want []int32
	}{
		{"lowercase", "HELLO World", []int32{2, 3}},
		{"punctuation isolated", "hello!world", []int32{2, 7, 3}},
		{"greedy subword", "world hello", []int32{3, 2}},
		{"subword continuation", "worldx", []int32{1}}, // wor+##ld+x: x unmatched → whole word UNK
		{"accents stripped", "café", []int32{6}},
		{"unknown word", "zzz", []int32{1}},
		{"over max chars", "hellohellohello", []int32{1}}, // 15 > 10 cap
		{"control chars dropped", "he\x00llo", []int32{2}},
		{"whitespace collapse", "  hello\t\nworld  ", []int32{2, 3}},
		{"empty", "", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := e.Tokenize(tc.in)
			if len(got) != len(tc.want) {
				t.Fatalf("Tokenize(%q) = %v, want %v", tc.in, got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("Tokenize(%q) = %v, want %v", tc.in, got, tc.want)
				}
			}
		})
	}
}

func TestStaticEmbedderPoolingMath(t *testing.T) {
	e := miniEmbedder(t)
	ctx := context.Background()

	// "hello world" → rows (1,0) and (0,1) → mean (0.5,0.5) → normalized
	// (√2/2, √2/2).
	v, err := e.Embed(ctx, "hello world")
	if err != nil {
		t.Fatalf("Embed: %v", err)
	}
	want := float32(math.Sqrt2 / 2)
	for i, x := range v {
		if math.Abs(float64(x-want)) > 1e-6 {
			t.Fatalf("Embed dim %d = %v, want %v", i, v, want)
		}
	}

	// Unknown-only text: unk id is in drop_token_ids → zero vector.
	v, err = e.Embed(ctx, "zzz qqq")
	if err != nil {
		t.Fatalf("Embed: %v", err)
	}
	for _, x := range v {
		if x != 0 {
			t.Fatalf("all-unknown text should embed to zero vector, got %v", v)
		}
	}

	// Empty text: zero vector, no error.
	v, err = e.Embed(ctx, "")
	if err != nil {
		t.Fatalf("Embed empty: %v", err)
	}
	for _, x := range v {
		if x != 0 {
			t.Fatalf("empty text should embed to zero vector, got %v", v)
		}
	}
}

func TestStaticEmbedderRejectsGarbage(t *testing.T) {
	if _, err := ReadStaticEmbedder(bytes.NewReader([]byte("not a model"))); err == nil {
		t.Fatal("expected error for garbage input")
	}
	if _, err := ReadStaticEmbedder(bytes.NewReader([]byte("RGEMBED1\xff\xff\xff\xff"))); err == nil {
		t.Fatal("expected error for absurd header length")
	}
}

// ── Verified loading (supply-chain integrity) ──

// writeMiniModel writes a mini .rgemb to a temp file and returns its path
// and its true SHA-256 hex digest.
func writeMiniModel(t *testing.T) (path, digest string) {
	t.Helper()
	vocab := []string{"[PAD]", "[UNK]", "hello", "world", "##ld", "wor", "cafe", "!"}
	rows := [][]float32{{0, 0}, {9, 9}, {1, 0}, {0, 1}, {0.5, 0.5}, {2, 0}, {0, 2}, {1, 1}}
	data := buildMiniRGEMB(t, vocab, 2, rows, true)
	path = filepath.Join(t.TempDir(), "mini.rgemb")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write model: %v", err)
	}
	sum := sha256.Sum256(data)
	return path, hex.EncodeToString(sum[:])
}

func TestStaticEmbedderFileDigestMatchesContents(t *testing.T) {
	path, want := writeMiniModel(t)
	got, err := StaticEmbedderFileDigest(path)
	if err != nil {
		t.Fatalf("digest: %v", err)
	}
	if got != want {
		t.Errorf("StaticEmbedderFileDigest = %s, want %s", got, want)
	}
	// The digest it reports must be the digest that unlocks the load —
	// otherwise the documented "compute once, pin it" workflow is broken.
	if _, err := LoadStaticEmbedderVerified(path, got); err != nil {
		t.Errorf("load with self-reported digest: %v", err)
	}
}

func TestStaticEmbedderVerifiedAcceptsMatchingDigest(t *testing.T) {
	path, digest := writeMiniModel(t)
	e, err := LoadStaticEmbedderVerified(path, digest)
	if err != nil {
		t.Fatalf("verified load: %v", err)
	}
	if e.Dim() != 2 {
		t.Errorf("Dim() = %d, want 2", e.Dim())
	}
	// Pins are copied out of build logs and READMEs; case must not matter.
	if _, err := LoadStaticEmbedderVerified(path, strings.ToUpper(digest)); err != nil {
		t.Errorf("uppercase digest rejected: %v", err)
	}
	if _, err := LoadStaticEmbedderVerified(path, "  "+digest+"\n"); err != nil {
		t.Errorf("padded digest rejected: %v", err)
	}
}

func TestStaticEmbedderVerifiedRejectsTamperedFile(t *testing.T) {
	path, digest := writeMiniModel(t)

	// Flip one byte deep in the embedding matrix — a change that parses
	// perfectly and silently returns different vectors. This is exactly the
	// attack the digest exists to catch: a valid model with poisoned weights.
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read model: %v", err)
	}
	data[len(data)-3] ^= 0xff
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write tampered model: %v", err)
	}

	// It must still be a loadable model — proving the digest, not the parser,
	// is what rejects it.
	if _, err := LoadStaticEmbedder(path); err != nil {
		t.Fatalf("tampered model should still parse unverified: %v", err)
	}
	_, err = LoadStaticEmbedderVerified(path, digest)
	if err == nil {
		t.Fatal("expected digest mismatch for tampered file")
	}
	if !strings.Contains(err.Error(), "digest mismatch") {
		t.Errorf("error = %v, want a digest mismatch", err)
	}
}

func TestStaticEmbedderVerifiedRejectsMalformedPin(t *testing.T) {
	path, digest := writeMiniModel(t)
	for _, tc := range []struct{ name, pin string }{
		{"empty", ""},
		{"truncated", digest[:32]},
		{"not hex", strings.Repeat("z", 64)},
		{"too long", digest + "00"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := LoadStaticEmbedderVerified(path, tc.pin); err == nil {
				t.Errorf("pin %q accepted, want rejection", tc.pin)
			}
		})
	}
}

func TestStaticEmbedderVerifiedDoesNotParseBeforeVerifying(t *testing.T) {
	// A file that is NOT a .rgemb at all, pinned to its own true digest.
	// If verification runs first, the error must come from the parser
	// ("not a .rgemb"), never from the digest — the digest matches.
	// Conversely, pinned to a wrong digest, the error must be the digest,
	// proving no parse was attempted on unverified bytes.
	junk := []byte("this is not a model file at all")
	path := filepath.Join(t.TempDir(), "junk.rgemb")
	if err := os.WriteFile(path, junk, 0o600); err != nil {
		t.Fatalf("write junk: %v", err)
	}
	sum := sha256.Sum256(junk)

	_, err := LoadStaticEmbedderVerified(path, hex.EncodeToString(sum[:]))
	if err == nil || !strings.Contains(err.Error(), "not a .rgemb") {
		t.Errorf("matching digest should reach the parser, got %v", err)
	}

	wrong := strings.Repeat("ab", 32)
	_, err = LoadStaticEmbedderVerified(path, wrong)
	if err == nil || !strings.Contains(err.Error(), "digest mismatch") {
		t.Errorf("wrong digest must fail on the digest, not the parser, got %v", err)
	}
}

// ── Golden conformance test (gated on the real converted model) ──
//
// Run with:
//   RATEGUARD_EMBED_MODEL=/path/to/potion-base-2M.rgemb go test -run Golden
//
// The goldens in conformance/static_embedding_vectors.json were generated
// by the reference model2vec library itself (see the file's "generator"
// field) — this asserts parity with ground truth, not self-consistency.
// Note: model2vec's tokenize() removes unknown-token ids, so golden
// token_ids are post-drop; we filter ours the same way before comparing.

type embeddingGoldens struct {
	Dim   int `json:"dim"`
	Cases []struct {
		Text      string    `json:"text"`
		TokenIDs  []int32   `json:"token_ids"`
		Embedding []float64 `json:"embedding"`
	} `json:"cases"`
}

func TestStaticEmbedderGoldenConformance(t *testing.T) {
	modelPath := os.Getenv("RATEGUARD_EMBED_MODEL")
	if modelPath == "" {
		t.Skip("RATEGUARD_EMBED_MODEL not set — skipping real-model conformance (see scripts/convert_model2vec.py)")
	}
	e, err := LoadStaticEmbedder(modelPath)
	if err != nil {
		t.Fatalf("load model: %v", err)
	}

	raw, err := os.ReadFile("../../conformance/static_embedding_vectors.json")
	if err != nil {
		t.Fatalf("read goldens: %v", err)
	}
	var goldens embeddingGoldens
	if err := json.Unmarshal(raw, &goldens); err != nil {
		t.Fatalf("parse goldens: %v", err)
	}
	if e.Dim() != goldens.Dim {
		t.Fatalf("model dim %d != golden dim %d", e.Dim(), goldens.Dim)
	}

	ctx := context.Background()
	const tol = 1e-4
	for i, c := range goldens.Cases {
		// Token ids: exact match after dropping unk (mirrors model2vec).
		var got []int32
		for _, id := range e.Tokenize(c.Text) {
			if !e.drop[id] {
				got = append(got, id)
			}
		}
		if len(got) != len(c.TokenIDs) {
			t.Fatalf("case %d %q: token ids %v, want %v", i, c.Text, got, c.TokenIDs)
		}
		for j := range got {
			if got[j] != c.TokenIDs[j] {
				t.Fatalf("case %d %q: token ids %v, want %v", i, c.Text, got, c.TokenIDs)
			}
		}

		// Embedding: element-wise within tolerance.
		vec, err := e.Embed(ctx, c.Text)
		if err != nil {
			t.Fatalf("case %d embed: %v", i, err)
		}
		for j := range vec {
			if diff := math.Abs(float64(vec[j]) - c.Embedding[j]); diff > tol {
				t.Fatalf("case %d %q dim %d: got %g want %g (diff %g)", i, c.Text, j, vec[j], c.Embedding[j], diff)
			}
		}
	}
}
