/**
 * Dependency-free, CJK-aware token estimation.
 *
 * RateGuard sizes two things in tokens without calling the provider: the
 * TokenLimitGuardrail (blocks a prompt over a limit) and the pre-flight budget
 * reservation. The naive chars/4 heuristic — one token per four characters —
 * holds for Latin scripts but undercounts Chinese, Japanese, and Korean text
 * by roughly 75%: those scripts tokenize at about one token per character, not
 * one per four. A 40k-token CJK prompt would read as ~10k and slip past a
 * limit sized in tokens, a real denial-of-wallet / limit-evasion gap. (The
 * naive form also counted `String.length`, i.e. UTF-16 units, so it disagreed
 * with Go's byte count and Python's code-point count on the same string.)
 *
 * `estimateTokens` is the shared fix: it counts CJK code points at ~1 token
 * each and everything else at ~4 characters per token, iterating by code point
 * so all three SDKs agree. The agreement is locked by
 * conformance/token_estimate_vectors.json. It is an estimate, deliberately
 * biased not to UNDER-count so enforcement fails safe. When exact counts
 * matter, supply a Tokenizer (e.g. wrapping tiktoken) — the interface is the
 * plug-in point.
 *
 * Sources: OpenAI's published rule of thumb (~4 chars/token for English); the
 * ~1 token/char CJK ratio is the documented behavior of the cl100k_base /
 * o200k_base BPE vocabularies for unified ideographs and kana/hangul.
 */

/** Estimates the token count of a string. Implement to plug in an exact
 * tokenizer where accuracy matters more than zero dependencies. */
export interface Tokenizer {
  estimateTokens(text: string): number;
}

// CJK code-point blocks that tokenize at roughly one token per character.
// Identical across the Go/Node/Python SDKs; changing this set changes the
// conformance vectors. Bounds are inclusive.
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xac00, 0xd7af], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0x20000, 0x2ebef], // CJK Unified Ideographs Extension B and beyond (astral)
];

function isCJK(codePoint: number): boolean {
  for (const [low, high] of CJK_RANGES) {
    if (codePoint >= low && codePoint <= high) return true;
  }
  return false;
}

/**
 * RateGuard's default token estimate: ~1 token per CJK character, ~1 token per
 * 4 characters otherwise, rounded up. Biased not to under-count so a
 * token-sized limit fails safe on CJK input. See the file comment.
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    // `for..of` yields whole code points; codePointAt(0) is never undefined here.
    if (isCJK(ch.codePointAt(0)!)) cjk++;
    else other++;
  }
  // ceil(other / 4) without floats: the non-CJK share, rounded up.
  return cjk + Math.floor((other + 3) / 4);
}

/** Estimate via a caller-supplied Tokenizer, falling back to the default
 * CJK-aware heuristic when undefined. */
export function estimateWith(tokenizer: Tokenizer | undefined, text: string): number {
  return tokenizer ? tokenizer.estimateTokens(text) : estimateTokens(text);
}
