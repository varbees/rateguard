package rateguard

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// ── Static Embedder — local, zero-inference-dependency embeddings ──
//
// Loads a model2vec-style static embedding model from RateGuard's .rgemb
// format (produced by scripts/convert_model2vec.py from any
// minishlab/potion-* model). Inference is a WordPiece tokenization, an
// embedding-row lookup, mean pooling, and an L2 normalize — no ONNX, no
// CGO, no network. An 8MB model file gives cosine separation good enough
// for semantic caching and paraphrase-loop detection (potion-base-2M:
// measured 0.995 on a paraphrase pair vs -0.34 on an unrelated pair).
//
// The inference contract mirrors model2vec's model.py exactly (verified
// 2026-07-09): tokenize with no special tokens, drop unknown-token ids,
// mean pool, L2 normalize with +1e-32 on the norm. Cross-language parity
// is asserted by conformance/static_embedding_vectors.json, generated
// from the reference model2vec library itself — not from this code.
//
// The model file is data, not a dependency: nothing is bundled with the
// SDK. Download a converted model (or convert your own) and load it by
// path. StaticEmbedder implements Embedder, so it plugs directly into
// SemanticCacheOptions and SemanticLoopDetector.

const rgembMagic = "RGEMBED1"

// rgembTokenizer is the tokenizer section of the .rgemb header.
type rgembTokenizer struct {
	Type                    string `json:"type"`
	Lowercase               bool   `json:"lowercase"`
	StripAccents            bool   `json:"strip_accents"`
	CleanText               bool   `json:"clean_text"`
	HandleChineseChars      bool   `json:"handle_chinese_chars"`
	ContinuingSubwordPrefix string `json:"continuing_subword_prefix"`
	UnkID                   int32  `json:"unk_id"`
	MaxInputCharsPerWord    int    `json:"max_input_chars_per_word"`
}

type rgembHeader struct {
	Format       string         `json:"format"`
	Source       string         `json:"source"`
	Dim          int            `json:"dim"`
	VocabSize    int            `json:"vocab_size"`
	DType        string         `json:"dtype"`
	Normalize    bool           `json:"normalize"`
	NormEpsilon  float64        `json:"norm_epsilon"`
	DropTokenIDs []int32        `json:"drop_token_ids"`
	Tokenizer    rgembTokenizer `json:"tokenizer"`
}

// StaticEmbedder embeds text with a local static embedding model. It is
// safe for concurrent use: all state is read-only after load.
type StaticEmbedder struct {
	header rgembHeader
	vocab  map[string]int32
	matrix []float32 // vocab_size × dim, row-major
	drop   map[int32]bool
}

// LoadStaticEmbedder loads a .rgemb model from a file path.
func LoadStaticEmbedder(path string) (*StaticEmbedder, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("rateguard: open embed model: %w", err)
	}
	defer f.Close()
	return ReadStaticEmbedder(f)
}

// ReadStaticEmbedder loads a .rgemb model from a reader.
func ReadStaticEmbedder(r io.Reader) (*StaticEmbedder, error) {
	br := &countingReader{r: r}

	magic := make([]byte, 8)
	if _, err := io.ReadFull(br, magic); err != nil {
		return nil, fmt.Errorf("rateguard: read embed model magic: %w", err)
	}
	if string(magic) != rgembMagic {
		return nil, fmt.Errorf("rateguard: not a .rgemb file (magic %q)", magic)
	}

	var headerLen uint32
	if err := binary.Read(br, binary.LittleEndian, &headerLen); err != nil {
		return nil, fmt.Errorf("rateguard: read embed model header length: %w", err)
	}
	if headerLen > 1<<20 {
		return nil, fmt.Errorf("rateguard: embed model header implausibly large (%d bytes)", headerLen)
	}
	headerBytes := make([]byte, headerLen)
	if _, err := io.ReadFull(br, headerBytes); err != nil {
		return nil, fmt.Errorf("rateguard: read embed model header: %w", err)
	}
	var header rgembHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("rateguard: parse embed model header: %w", err)
	}
	if header.Format != "rgemb/1" {
		return nil, fmt.Errorf("rateguard: unsupported embed model format %q", header.Format)
	}
	if header.DType != "f32" {
		return nil, fmt.Errorf("rateguard: unsupported embed model dtype %q", header.DType)
	}
	if header.Tokenizer.Type != "wordpiece" {
		return nil, fmt.Errorf("rateguard: unsupported tokenizer type %q", header.Tokenizer.Type)
	}
	if header.Dim <= 0 || header.VocabSize <= 0 {
		return nil, fmt.Errorf("rateguard: invalid embed model dimensions %dx%d", header.VocabSize, header.Dim)
	}

	vocab := make(map[string]int32, header.VocabSize)
	lenBuf := make([]byte, 2)
	for i := 0; i < header.VocabSize; i++ {
		if _, err := io.ReadFull(br, lenBuf); err != nil {
			return nil, fmt.Errorf("rateguard: read vocab entry %d: %w", i, err)
		}
		n := binary.LittleEndian.Uint16(lenBuf)
		tok := make([]byte, n)
		if _, err := io.ReadFull(br, tok); err != nil {
			return nil, fmt.Errorf("rateguard: read vocab entry %d: %w", i, err)
		}
		vocab[string(tok)] = int32(i)
	}

	matrix := make([]float32, header.VocabSize*header.Dim)
	if err := binary.Read(br, binary.LittleEndian, &matrix); err != nil {
		return nil, fmt.Errorf("rateguard: read embedding matrix: %w", err)
	}

	drop := make(map[int32]bool, len(header.DropTokenIDs))
	for _, id := range header.DropTokenIDs {
		drop[id] = true
	}

	return &StaticEmbedder{header: header, vocab: vocab, matrix: matrix, drop: drop}, nil
}

// Dim returns the embedding dimensionality.
func (e *StaticEmbedder) Dim() int { return e.header.Dim }

// Source returns the identifier of the model this file was converted from.
func (e *StaticEmbedder) Source() string { return e.header.Source }

// Embed implements Embedder. Output vectors are L2-normalized (when the
// model's config says so — true for potion models), so their dot product
// is their cosine similarity. Text that tokenizes to nothing (empty,
// whitespace, all-unknown) returns the zero vector.
func (e *StaticEmbedder) Embed(_ context.Context, text string) ([]float32, error) {
	ids := e.Tokenize(text)
	dim := e.header.Dim
	out := make([]float32, dim)

	kept := 0
	sums := make([]float64, dim)
	for _, id := range ids {
		if e.drop[id] {
			continue
		}
		row := int(id) * dim
		for j := range dim {
			sums[j] += float64(e.matrix[row+j])
		}
		kept++
	}
	if kept == 0 {
		return out, nil // zero vector, matching model2vec's np.zeros(dim)
	}

	var normSq float64
	for j := range dim {
		sums[j] /= float64(kept)
		normSq += sums[j] * sums[j]
	}
	if e.header.Normalize {
		n := math.Sqrt(normSq) + e.header.NormEpsilon
		for j := range dim {
			out[j] = float32(sums[j] / n)
		}
	} else {
		for j := range dim {
			out[j] = float32(sums[j])
		}
	}
	return out, nil
}

// Tokenize runs the full BertNormalizer → BertPreTokenizer → WordPiece
// pipeline and returns token ids (unknown-token ids included — Embed is
// what drops them, mirroring model2vec's split of responsibilities).
// Exported because the conformance suite asserts token ids across all
// three SDKs, not just final vectors.
func (e *StaticEmbedder) Tokenize(text string) []int32 {
	t := e.header.Tokenizer
	s := text
	if t.CleanText {
		s = bertCleanText(s)
	}
	if t.HandleChineseChars {
		s = bertPadChineseChars(s)
	}
	if t.StripAccents {
		s = bertStripAccents(s)
	}
	if t.Lowercase {
		s = strings.ToLower(s)
	}

	words := bertPreTokenize(s)
	var ids []int32
	for _, w := range words {
		ids = append(ids, e.wordpiece(w)...)
	}
	return ids
}

// wordpiece is greedy longest-match-first with a continuation prefix,
// exactly the HF WordPiece model: a word longer than the char cap, or one
// with any unmatchable remainder, becomes a single unknown token.
func (e *StaticEmbedder) wordpiece(word string) []int32 {
	t := e.header.Tokenizer
	runes := []rune(word)
	if len(runes) > t.MaxInputCharsPerWord {
		return []int32{t.UnkID}
	}
	var pieces []int32
	start := 0
	for start < len(runes) {
		end := len(runes)
		cur := int32(-1)
		for start < end {
			sub := string(runes[start:end])
			if start > 0 {
				sub = t.ContinuingSubwordPrefix + sub
			}
			if id, ok := e.vocab[sub]; ok {
				cur = id
				break
			}
			end--
		}
		if cur == -1 {
			return []int32{t.UnkID}
		}
		pieces = append(pieces, cur)
		start = end
	}
	return pieces
}

// ── BertNormalizer / BertPreTokenizer primitives ──
// Semantics mirror huggingface/tokenizers' bert.rs so that token ids match
// the reference tokenizer byte-for-byte. Each helper documents the exact
// rule it copies.

// bertCleanText drops NUL, U+FFFD, and control characters (category C,
// except tab/newline/CR which count as whitespace), and maps every
// whitespace character to a plain space.
func bertCleanText(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r == 0 || r == 0xFFFD:
			// dropped
		case r == '\t' || r == '\n' || r == '\r':
			b.WriteByte(' ')
		case unicode.In(r, unicode.C):
			// dropped
		case unicode.IsSpace(r):
			b.WriteByte(' ')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// bertIsChinese reports whether r is a CJK ideograph per BERT's ranges
// (CJK Unified Ideographs + extensions + compatibility blocks). Kana and
// Hangul are deliberately NOT included — same as BERT.
func bertIsChinese(r rune) bool {
	switch {
	case r >= 0x4E00 && r <= 0x9FFF,
		r >= 0x3400 && r <= 0x4DBF,
		r >= 0x20000 && r <= 0x2A6DF,
		r >= 0x2A700 && r <= 0x2B73F,
		r >= 0x2B740 && r <= 0x2B81F,
		r >= 0x2B820 && r <= 0x2CEAF,
		r >= 0xF900 && r <= 0xFAFF,
		r >= 0x2F800 && r <= 0x2FA1F:
		return true
	}
	return false
}

// bertPadChineseChars surrounds each CJK ideograph with spaces so each
// becomes its own word for WordPiece.
func bertPadChineseChars(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 8)
	for _, r := range s {
		if bertIsChinese(r) {
			b.WriteByte(' ')
			b.WriteRune(r)
			b.WriteByte(' ')
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// bertStripAccents NFD-decomposes and removes nonspacing marks (Mn).
func bertStripAccents(s string) string {
	decomposed := norm.NFD.String(s)
	var b strings.Builder
	b.Grow(len(decomposed))
	for _, r := range decomposed {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// bertIsPunctuation matches HF's rule: ASCII symbol/punctuation ranges
// (33-47, 58-64, 91-96, 123-126) or any Unicode P category character.
func bertIsPunctuation(r rune) bool {
	if (r >= 33 && r <= 47) || (r >= 58 && r <= 64) || (r >= 91 && r <= 96) || (r >= 123 && r <= 126) {
		return true
	}
	return unicode.IsPunct(r)
}

// bertPreTokenize splits on whitespace (removed) and isolates each
// punctuation character as its own word.
func bertPreTokenize(s string) []string {
	var words []string
	var cur strings.Builder
	flush := func() {
		if cur.Len() > 0 {
			words = append(words, cur.String())
			cur.Reset()
		}
	}
	for _, r := range s {
		switch {
		case unicode.IsSpace(r):
			flush()
		case bertIsPunctuation(r):
			flush()
			words = append(words, string(r))
		default:
			cur.WriteRune(r)
		}
	}
	flush()
	return words
}

// countingReader lets binary.Read work on a plain reader without
// buffering the whole file.
type countingReader struct{ r io.Reader }

func (c *countingReader) Read(p []byte) (int, error) { return c.r.Read(p) }
