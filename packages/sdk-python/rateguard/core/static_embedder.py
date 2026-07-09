"""Static Embedder — local, zero-inference-dependency embeddings.

Loads a model2vec-style static embedding model from RateGuard's .rgemb
format (produced by scripts/convert_model2vec.py from any
minishlab/potion-* model). Inference is a WordPiece tokenization, an
embedding-row lookup, mean pooling, and an L2 normalize — no ONNX, no
compiled extension, no network. Pure stdlib: struct, json, unicodedata.

The inference contract mirrors model2vec's model.py exactly (verified
2026-07-09): tokenize with no special tokens, drop unknown-token ids,
mean pool, L2 normalize with +1e-32 on the norm. Cross-language parity
with the Go and Node SDKs is asserted by
conformance/static_embedding_vectors.json, generated from the reference
model2vec library itself — not from this code.

The model file is data, not a dependency: nothing is bundled with the
SDK. StaticEmbedder satisfies the async Embedder protocol, so it plugs
directly into SemanticCacheOptions and SemanticLoopDetector.
"""

from __future__ import annotations

import json
import math
import struct
import unicodedata
from dataclasses import dataclass
from typing import BinaryIO

RGEMB_MAGIC = b"RGEMBED1"
_MAX_HEADER_BYTES = 1 << 20


@dataclass(frozen=True)
class _TokenizerSpec:
    lowercase: bool
    strip_accents: bool
    clean_text: bool
    handle_chinese_chars: bool
    continuing_subword_prefix: str
    unk_id: int
    max_input_chars_per_word: int


# BERT's CJK ideograph ranges (kana and Hangul deliberately excluded).
_CJK_RANGES = (
    (0x4E00, 0x9FFF),
    (0x3400, 0x4DBF),
    (0x20000, 0x2A6DF),
    (0x2A700, 0x2B73F),
    (0x2B740, 0x2B81F),
    (0x2B820, 0x2CEAF),
    (0xF900, 0xFAFF),
    (0x2F800, 0x2FA1F),
)


def _is_cjk(cp: int) -> bool:
    return any(lo <= cp <= hi for lo, hi in _CJK_RANGES)


def _is_bert_punctuation(ch: str) -> bool:
    cp = ord(ch)
    if 33 <= cp <= 47 or 58 <= cp <= 64 or 91 <= cp <= 96 or 123 <= cp <= 126:
        return True
    return unicodedata.category(ch).startswith("P")


def _is_control(ch: str) -> bool:
    if ch in ("\t", "\n", "\r"):
        return False
    return unicodedata.category(ch).startswith("C")


class StaticEmbedder:
    """Embeds text with a local static embedding model.

    Read-only after load — safe to share across threads and tasks.
    """

    def __init__(
        self,
        *,
        dim: int,
        source: str,
        normalize: bool,
        norm_epsilon: float,
        drop_token_ids: frozenset[int],
        tokenizer: _TokenizerSpec,
        vocab: dict[str, int],
        matrix: list[float],
    ) -> None:
        self._dim = dim
        self._source = source
        self._normalize = normalize
        self._norm_epsilon = norm_epsilon
        self._drop = drop_token_ids
        self._tok = tokenizer
        self._vocab = vocab
        self._matrix = matrix

    # ── loading ──

    @classmethod
    def load(cls, path: str) -> "StaticEmbedder":
        """Load a .rgemb model from a file path."""
        with open(path, "rb") as f:
            return cls.read(f)

    @classmethod
    def read(cls, f: BinaryIO) -> "StaticEmbedder":
        """Load a .rgemb model from a binary stream."""
        magic = f.read(8)
        if magic != RGEMB_MAGIC:
            raise ValueError(f"not a .rgemb file (magic {magic!r})")
        (header_len,) = struct.unpack("<I", _read_exact(f, 4))
        if header_len > _MAX_HEADER_BYTES:
            raise ValueError(f"embed model header implausibly large ({header_len} bytes)")
        header = json.loads(_read_exact(f, header_len))
        if header.get("format") != "rgemb/1":
            raise ValueError(f"unsupported embed model format {header.get('format')!r}")
        if header.get("dtype") != "f32":
            raise ValueError(f"unsupported embed model dtype {header.get('dtype')!r}")
        tok_raw = header.get("tokenizer") or {}
        if tok_raw.get("type") != "wordpiece":
            raise ValueError(f"unsupported tokenizer type {tok_raw.get('type')!r}")
        dim = int(header["dim"])
        vocab_size = int(header["vocab_size"])
        if dim <= 0 or vocab_size <= 0:
            raise ValueError(f"invalid embed model dimensions {vocab_size}x{dim}")

        vocab: dict[str, int] = {}
        for i in range(vocab_size):
            (n,) = struct.unpack("<H", _read_exact(f, 2))
            vocab[_read_exact(f, n).decode("utf-8")] = i

        raw = _read_exact(f, vocab_size * dim * 4)
        matrix = list(struct.unpack(f"<{vocab_size * dim}f", raw))

        tokenizer = _TokenizerSpec(
            lowercase=bool(tok_raw.get("lowercase", True)),
            strip_accents=bool(tok_raw.get("strip_accents", True)),
            clean_text=bool(tok_raw.get("clean_text", True)),
            handle_chinese_chars=bool(tok_raw.get("handle_chinese_chars", True)),
            continuing_subword_prefix=str(tok_raw.get("continuing_subword_prefix", "##")),
            unk_id=int(tok_raw["unk_id"]),
            max_input_chars_per_word=int(tok_raw.get("max_input_chars_per_word", 100)),
        )
        return cls(
            dim=dim,
            source=str(header.get("source", "")),
            normalize=bool(header.get("normalize", False)),
            norm_epsilon=float(header.get("norm_epsilon", 1e-32)),
            drop_token_ids=frozenset(int(i) for i in header.get("drop_token_ids", [])),
            tokenizer=tokenizer,
            vocab=vocab,
            matrix=matrix,
        )

    # ── public surface ──

    @property
    def dim(self) -> int:
        """Embedding dimensionality."""
        return self._dim

    @property
    def source(self) -> str:
        """Identifier of the model this file was converted from."""
        return self._source

    async def embed(self, text: str) -> list[float]:
        """Embedder protocol. Output is L2-normalized (when the model's
        config says so — true for potion models), so dot product equals
        cosine similarity. Text that tokenizes to nothing returns the
        zero vector."""
        return self.embed_sync(text)

    def embed_sync(self, text: str) -> list[float]:
        """Synchronous embedding — the computation is pure CPU."""
        dim = self._dim
        sums = [0.0] * dim
        kept = 0
        for token_id in self.tokenize(text):
            if token_id in self._drop:
                continue
            row = token_id * dim
            for j in range(dim):
                sums[j] += self._matrix[row + j]
            kept += 1
        if kept == 0:
            return [0.0] * dim  # zero vector, matching model2vec's np.zeros(dim)

        for j in range(dim):
            sums[j] /= kept
        if self._normalize:
            n = math.sqrt(math.fsum(x * x for x in sums)) + self._norm_epsilon
            return [x / n for x in sums]
        return sums

    def tokenize(self, text: str) -> list[int]:
        """Full BertNormalizer → BertPreTokenizer → WordPiece pipeline.

        Returns token ids with unknown-token ids included — embed() is
        what drops them, mirroring model2vec's split of responsibilities.
        Exported because the conformance suite asserts token ids across
        all three SDKs, not just final vectors.
        """
        t = self._tok
        s = text
        if t.clean_text:
            s = _bert_clean_text(s)
        if t.handle_chinese_chars:
            s = _bert_pad_chinese_chars(s)
        if t.strip_accents:
            s = _bert_strip_accents(s)
        if t.lowercase:
            s = s.lower()

        ids: list[int] = []
        for word in _bert_pre_tokenize(s):
            ids.extend(self._wordpiece(word))
        return ids

    def _wordpiece(self, word: str) -> list[int]:
        """Greedy longest-match-first with a continuation prefix, exactly
        the HF WordPiece model: a word over the char cap, or with any
        unmatchable remainder, becomes a single unknown token."""
        t = self._tok
        if len(word) > t.max_input_chars_per_word:
            return [t.unk_id]
        pieces: list[int] = []
        start = 0
        while start < len(word):
            end = len(word)
            cur = -1
            while start < end:
                sub = word[start:end]
                if start > 0:
                    sub = t.continuing_subword_prefix + sub
                found = self._vocab.get(sub)
                if found is not None:
                    cur = found
                    break
                end -= 1
            if cur == -1:
                return [t.unk_id]
            pieces.append(cur)
            start = end
        return pieces


# ── BertNormalizer / BertPreTokenizer primitives ──
# Semantics mirror huggingface/tokenizers' bert.rs so token ids match the
# reference tokenizer byte-for-byte (asserted by the conformance goldens).


def _bert_clean_text(s: str) -> str:
    out: list[str] = []
    for ch in s:
        if ch == "\x00" or ch == "�":
            continue
        if ch in ("\t", "\n", "\r"):
            out.append(" ")
            continue
        if _is_control(ch):
            continue
        if ch.isspace():
            out.append(" ")
            continue
        out.append(ch)
    return "".join(out)


def _bert_pad_chinese_chars(s: str) -> str:
    out: list[str] = []
    for ch in s:
        if _is_cjk(ord(ch)):
            out.append(f" {ch} ")
        else:
            out.append(ch)
    return "".join(out)


def _bert_strip_accents(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")


def _bert_pre_tokenize(s: str) -> list[str]:
    words: list[str] = []
    cur: list[str] = []
    for ch in s:
        if ch.isspace():
            if cur:
                words.append("".join(cur))
                cur = []
        elif _is_bert_punctuation(ch):
            if cur:
                words.append("".join(cur))
                cur = []
            words.append(ch)
        else:
            cur.append(ch)
    if cur:
        words.append("".join(cur))
    return words


def _read_exact(f: BinaryIO, n: int) -> bytes:
    data = f.read(n)
    if len(data) != n:
        raise ValueError(f"truncated .rgemb file: wanted {n} bytes, got {len(data)}")
    return data
