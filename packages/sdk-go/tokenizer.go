package rateguard

// Dependency-free, CJK-aware token estimation.
//
// RateGuard sizes two things in tokens without calling the provider: the
// TokenLimitGuardrail (blocks a prompt over a limit) and the pre-flight budget
// reservation. The naive chars/4 heuristic — one token per four characters —
// holds for Latin scripts but undercounts Chinese, Japanese, and Korean text
// by roughly 75%: those scripts tokenize at about one token per character, not
// one per four. A 40k-token CJK prompt would read as ~10k and slip past a limit
// sized in tokens, a real denial-of-wallet / limit-evasion gap. (Go had a
// second bug here: len(string) counts BYTES, so a CJK char at 3 UTF-8 bytes
// estimated differently from Node/Python, which count code points — the SDKs
// disagreed on the same string.)
//
// EstimateTokens is the shared fix: it counts CJK code points at ~1 token each
// and everything else at ~4 characters per token, iterating by rune so all
// three SDKs agree. The agreement is locked by
// conformance/token_estimate_vectors.json. It is an estimate, deliberately
// biased not to UNDER-count so enforcement fails safe. When exact counts
// matter, supply a Tokenizer (e.g. wrapping tiktoken) — the interface is the
// plug-in point.
//
// Sources: OpenAI's published rule of thumb (~4 chars/token for English); the
// ~1 token/char CJK ratio is the documented behavior of the cl100k_base /
// o200k_base BPE vocabularies for unified ideographs and kana/hangul.

// Tokenizer estimates the token count of a string. Implement it to plug in an
// exact tokenizer where accuracy matters more than zero dependencies.
type Tokenizer interface {
	EstimateTokens(text string) int
}

// TokenizerFunc adapts a plain func to the Tokenizer interface.
type TokenizerFunc func(string) int

// EstimateTokens implements Tokenizer.
func (f TokenizerFunc) EstimateTokens(text string) int { return f(text) }

// cjkRanges are the code-point blocks that tokenize at roughly one token per
// character. Identical across the Go/Node/Python SDKs; changing this set
// changes the conformance vectors. Bounds are inclusive.
var cjkRanges = [...][2]rune{
	{0x3040, 0x309F},   // Hiragana
	{0x30A0, 0x30FF},   // Katakana
	{0x3400, 0x4DBF},   // CJK Unified Ideographs Extension A
	{0x4E00, 0x9FFF},   // CJK Unified Ideographs
	{0xAC00, 0xD7AF},   // Hangul Syllables
	{0xF900, 0xFAFF},   // CJK Compatibility Ideographs
	{0x20000, 0x2EBEF}, // CJK Unified Ideographs Extension B and beyond (astral)
}

func isCJK(r rune) bool {
	for _, rng := range cjkRanges {
		if r >= rng[0] && r <= rng[1] {
			return true
		}
	}
	return false
}

// EstimateTokens is RateGuard's default token estimate: ~1 token per CJK
// character, ~1 token per 4 characters otherwise, rounded up. Biased not to
// under-count so a token-sized limit fails safe on CJK input. See the file
// comment for the rationale and sources.
func EstimateTokens(text string) int {
	cjk := 0
	other := 0
	for _, r := range text { // ranges by rune (code point), not byte
		if isCJK(r) {
			cjk++
		} else {
			other++
		}
	}
	// ceil(other / 4) without floats: the non-CJK share, rounded up.
	return cjk + (other+3)/4
}

// EstimateWith estimates via a caller-supplied Tokenizer, falling back to the
// default CJK-aware heuristic when nil. Exported for parity: Node and Python
// both expose this, so a Go user writing the same "use my tokenizer, else the
// default" logic had to reimplement the nil check by hand.
func EstimateWith(t Tokenizer, text string) int {
	if t != nil {
		return t.EstimateTokens(text)
	}
	return EstimateTokens(text)
}
