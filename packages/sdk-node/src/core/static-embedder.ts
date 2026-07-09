/**
 * Static Embedder — local, zero-inference-dependency embeddings.
 *
 * Loads a model2vec-style static embedding model from RateGuard's .rgemb
 * format (produced by scripts/convert_model2vec.py from any
 * minishlab/potion-* model). Inference is a WordPiece tokenization, an
 * embedding-row lookup, mean pooling, and an L2 normalize — no ONNX, no
 * native addon, no network. Pure Node stdlib: Buffer + String.normalize.
 *
 * The inference contract mirrors model2vec's model.py exactly (verified
 * 2026-07-09): tokenize with no special tokens, drop unknown-token ids,
 * mean pool, L2 normalize with +1e-32 on the norm. Cross-language parity
 * with the Go and Python SDKs is asserted by
 * conformance/static_embedding_vectors.json, generated from the reference
 * model2vec library itself — not from this code.
 *
 * The model file is data, not a dependency: nothing is bundled with the
 * SDK. StaticEmbedder implements Embedder, so it plugs directly into
 * semantic caching and SemanticLoopDetector.
 */

import { readFileSync } from 'node:fs';

import type { Embedder } from './semantic-cache.js';

const RGEMB_MAGIC = 'RGEMBED1';
const MAX_HEADER_BYTES = 1 << 20;

interface TokenizerSpec {
  lowercase: boolean;
  stripAccents: boolean;
  cleanText: boolean;
  handleChineseChars: boolean;
  continuingSubwordPrefix: string;
  unkId: number;
  maxInputCharsPerWord: number;
}

/** BERT's CJK ideograph ranges (kana and Hangul deliberately excluded). */
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f],
  [0x2b820, 0x2ceaf],
  [0xf900, 0xfaff],
  [0x2f800, 0x2fa1f],
];

function isCJK(cp: number): boolean {
  for (const [lo, hi] of CJK_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

// Unicode property escapes give exact category checks without tables.
const RE_PUNCT = /\p{P}/u;
const RE_MN = /\p{Mn}/u;
const RE_CONTROL = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/u;
const RE_SPACE = /\s/u;

function isBertPunctuation(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  if (
    (cp >= 33 && cp <= 47) ||
    (cp >= 58 && cp <= 64) ||
    (cp >= 91 && cp <= 96) ||
    (cp >= 123 && cp <= 126)
  ) {
    return true;
  }
  return RE_PUNCT.test(ch);
}

function bertCleanText(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch === '\u0000' || ch === '\uFFFD') continue;
    if (ch === '\t' || ch === '\n' || ch === '\r') {
      out += ' ';
      continue;
    }
    if (RE_CONTROL.test(ch)) continue;
    if (RE_SPACE.test(ch)) {
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

function bertPadChineseChars(s: string): string {
  let out = '';
  for (const ch of s) {
    if (isCJK(ch.codePointAt(0)!)) {
      out += ` ${ch} `;
    } else {
      out += ch;
    }
  }
  return out;
}

function bertStripAccents(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFD')) {
    if (RE_MN.test(ch)) continue;
    out += ch;
  }
  return out;
}

function bertPreTokenize(s: string): string[] {
  const words: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (RE_SPACE.test(ch)) {
      if (cur) {
        words.push(cur);
        cur = '';
      }
    } else if (isBertPunctuation(ch)) {
      if (cur) {
        words.push(cur);
        cur = '';
      }
      words.push(ch);
    } else {
      cur += ch;
    }
  }
  if (cur) words.push(cur);
  return words;
}

/**
 * Embeds text with a local static embedding model. Read-only after load —
 * safe to share across the whole process.
 */
export class StaticEmbedder implements Embedder {
  private constructor(
    private readonly dimension: number,
    private readonly modelSource: string,
    private readonly normalize: boolean,
    private readonly normEpsilon: number,
    private readonly drop: ReadonlySet<number>,
    private readonly tok: TokenizerSpec,
    private readonly vocab: ReadonlyMap<string, number>,
    private readonly matrix: Float32Array,
  ) {}

  /** Load a .rgemb model from a file path. */
  static load(path: string): StaticEmbedder {
    return StaticEmbedder.fromBuffer(readFileSync(path));
  }

  /** Load a .rgemb model from an in-memory buffer. */
  static fromBuffer(buf: Buffer): StaticEmbedder {
    if (buf.length < 12 || buf.toString('latin1', 0, 8) !== RGEMB_MAGIC) {
      throw new Error(`rateguard: not a .rgemb file`);
    }
    const headerLen = buf.readUInt32LE(8);
    if (headerLen > MAX_HEADER_BYTES) {
      throw new Error(`rateguard: embed model header implausibly large (${headerLen} bytes)`);
    }
    let off = 12;
    if (buf.length < off + headerLen) throw new Error('rateguard: truncated .rgemb header');
    const header = JSON.parse(buf.toString('utf8', off, off + headerLen)) as Record<string, unknown>;
    off += headerLen;

    if (header['format'] !== 'rgemb/1') {
      throw new Error(`rateguard: unsupported embed model format ${String(header['format'])}`);
    }
    if (header['dtype'] !== 'f32') {
      throw new Error(`rateguard: unsupported embed model dtype ${String(header['dtype'])}`);
    }
    const tokRaw = (header['tokenizer'] ?? {}) as Record<string, unknown>;
    if (tokRaw['type'] !== 'wordpiece') {
      throw new Error(`rateguard: unsupported tokenizer type ${String(tokRaw['type'])}`);
    }
    const dim = Number(header['dim']);
    const vocabSize = Number(header['vocab_size']);
    if (!Number.isInteger(dim) || dim <= 0 || !Number.isInteger(vocabSize) || vocabSize <= 0) {
      throw new Error(`rateguard: invalid embed model dimensions ${vocabSize}x${dim}`);
    }

    const vocab = new Map<string, number>();
    for (let i = 0; i < vocabSize; i++) {
      if (buf.length < off + 2) throw new Error('rateguard: truncated .rgemb vocab');
      const n = buf.readUInt16LE(off);
      off += 2;
      if (buf.length < off + n) throw new Error('rateguard: truncated .rgemb vocab');
      vocab.set(buf.toString('utf8', off, off + n), i);
      off += n;
    }

    const matrixBytes = vocabSize * dim * 4;
    if (buf.length < off + matrixBytes) throw new Error('rateguard: truncated .rgemb matrix');
    // Copy into an aligned Float32Array (the source offset may not be
    // 4-byte aligned inside the file buffer).
    const matrix = new Float32Array(vocabSize * dim);
    for (let i = 0; i < matrix.length; i++) {
      matrix[i] = buf.readFloatLE(off + i * 4);
    }

    const drop = new Set<number>(((header['drop_token_ids'] ?? []) as number[]).map(Number));
    const tok: TokenizerSpec = {
      lowercase: Boolean(tokRaw['lowercase'] ?? true),
      stripAccents: Boolean(tokRaw['strip_accents'] ?? true),
      cleanText: Boolean(tokRaw['clean_text'] ?? true),
      handleChineseChars: Boolean(tokRaw['handle_chinese_chars'] ?? true),
      continuingSubwordPrefix: String(tokRaw['continuing_subword_prefix'] ?? '##'),
      unkId: Number(tokRaw['unk_id']),
      maxInputCharsPerWord: Number(tokRaw['max_input_chars_per_word'] ?? 100),
    };
    return new StaticEmbedder(
      dim,
      String(header['source'] ?? ''),
      Boolean(header['normalize'] ?? false),
      Number(header['norm_epsilon'] ?? 1e-32),
      drop,
      tok,
      vocab,
      matrix,
    );
  }

  /** Embedding dimensionality. */
  get dim(): number {
    return this.dimension;
  }

  /** Identifier of the model this file was converted from. */
  get source(): string {
    return this.modelSource;
  }

  /**
   * Embedder interface. Output is L2-normalized (when the model's config
   * says so — true for potion models), so dot product equals cosine
   * similarity. Text that tokenizes to nothing returns the zero vector.
   */
  embed(text: string): Promise<number[]> {
    return Promise.resolve(this.embedSync(text));
  }

  /** Synchronous embedding — the computation is pure CPU. */
  embedSync(text: string): number[] {
    const dim = this.dimension;
    const sums = new Float64Array(dim);
    let kept = 0;
    for (const id of this.tokenize(text)) {
      if (this.drop.has(id)) continue;
      const row = id * dim;
      for (let j = 0; j < dim; j++) {
        // noUncheckedIndexedAccess: j < dim and row+j < vocabSize*dim by
        // construction, so these reads are always in range.
        sums[j] = (sums[j] as number) + (this.matrix[row + j] as number);
      }
      kept++;
    }
    const out = new Array<number>(dim).fill(0);
    if (kept === 0) return out; // zero vector, matching model2vec's np.zeros(dim)

    let normSq = 0;
    for (let j = 0; j < dim; j++) {
      const v = (sums[j] as number) / kept;
      sums[j] = v;
      normSq += v * v;
    }
    if (this.normalize) {
      const n = Math.sqrt(normSq) + this.normEpsilon;
      for (let j = 0; j < dim; j++) out[j] = (sums[j] as number) / n;
    } else {
      for (let j = 0; j < dim; j++) out[j] = sums[j] as number;
    }
    return out;
  }

  /**
   * Full BertNormalizer → BertPreTokenizer → WordPiece pipeline. Returns
   * token ids with unknown-token ids included — embedSync is what drops
   * them, mirroring model2vec's split of responsibilities. Exported
   * because the conformance suite asserts token ids across all three
   * SDKs, not just final vectors.
   */
  tokenize(text: string): number[] {
    const t = this.tok;
    let s = text;
    if (t.cleanText) s = bertCleanText(s);
    if (t.handleChineseChars) s = bertPadChineseChars(s);
    if (t.stripAccents) s = bertStripAccents(s);
    if (t.lowercase) s = s.toLowerCase();

    const ids: number[] = [];
    for (const word of bertPreTokenize(s)) {
      ids.push(...this.wordpiece(word));
    }
    return ids;
  }

  /**
   * Greedy longest-match-first with a continuation prefix, exactly the HF
   * WordPiece model: a word over the char cap, or with any unmatchable
   * remainder, becomes a single unknown token.
   */
  private wordpiece(word: string): number[] {
    const t = this.tok;
    const chars = Array.from(word); // code points, not UTF-16 units
    if (chars.length > t.maxInputCharsPerWord) return [t.unkId];
    const pieces: number[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let cur = -1;
      while (start < end) {
        let sub = chars.slice(start, end).join('');
        if (start > 0) sub = t.continuingSubwordPrefix + sub;
        const found = this.vocab.get(sub);
        if (found !== undefined) {
          cur = found;
          break;
        }
        end--;
      }
      if (cur === -1) return [t.unkId];
      pieces.push(cur);
      start = end;
    }
    return pieces;
  }
}
