#!/usr/bin/env python3
"""Convert a model2vec static-embedding model into RateGuard's .rgemb format.

Dev-time tool, stdlib only — no numpy, no safetensors package. The .rgemb
file is what the three SDKs load at runtime: one deliberately simple binary
format instead of three per-language parsers for safetensors + HF
tokenizer.json.

Usage:
    python3 scripts/convert_model2vec.py <model_dir> <out.rgemb>

<model_dir> must contain model.safetensors (single F32 tensor named
"embeddings"), tokenizer.json (WordPiece + BertNormalizer/BertPreTokenizer),
and config.json — the exact layout of minishlab/potion-* models on
Hugging Face.

.rgemb v1 layout (all little-endian):
    8 bytes  magic "RGEMBED1"
    u32      header JSON length
    bytes    header JSON (see build_header below)
    vocab    vocab_size entries of (u16 utf8-length + utf8 bytes); id = index
    matrix   vocab_size * dim float32
"""

from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path

MAGIC = b"RGEMBED1"


def read_safetensors_f32(path: Path, tensor_name: str) -> tuple[list[int], bytes]:
    """Return (shape, raw little-endian f32 bytes) for one tensor."""
    with open(path, "rb") as f:
        header_len = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(header_len))
        if tensor_name not in header:
            raise SystemExit(f"tensor {tensor_name!r} not in {list(header)}")
        info = header[tensor_name]
        if info["dtype"] != "F32":
            raise SystemExit(f"expected F32, got {info['dtype']} — quantized models unsupported in v1")
        start, end = info["data_offsets"]
        base = 8 + header_len
        f.seek(base + start)
        raw = f.read(end - start)
    shape = list(info["shape"])
    expected = 4
    for d in shape:
        expected *= d
    if len(raw) != expected:
        raise SystemExit(f"tensor byte length {len(raw)} != shape {shape}")
    return shape, raw


def build_header(tok: dict, cfg: dict, shape: list[int], source: str) -> dict:
    model = tok["model"]
    if model["type"] != "WordPiece":
        raise SystemExit(f"tokenizer type {model['type']!r} unsupported — .rgemb v1 is WordPiece-only")
    norm = tok.get("normalizer") or {}
    if norm.get("type") != "BertNormalizer":
        raise SystemExit(f"normalizer {norm.get('type')!r} unsupported — expected BertNormalizer")
    pre = tok.get("pre_tokenizer") or {}
    if pre.get("type") != "BertPreTokenizer":
        raise SystemExit(f"pre_tokenizer {pre.get('type')!r} unsupported — expected BertPreTokenizer")

    lowercase = bool(norm.get("lowercase", True))
    strip_accents = norm.get("strip_accents")
    if strip_accents is None:
        # HF BertNormalizer: when unset, strip_accents follows lowercase.
        strip_accents = lowercase

    vocab: dict[str, int] = model["vocab"]
    unk_token = model.get("unk_token", "[UNK]")
    if unk_token not in vocab:
        raise SystemExit(f"unk token {unk_token!r} missing from vocab")

    return {
        "format": "rgemb/1",
        "source": source,
        "dim": shape[1],
        "vocab_size": shape[0],
        "dtype": "f32",
        # model2vec inference contract (verified against model2vec/model.py):
        # encode without special tokens, drop unk ids, mean pool, then L2
        # normalize with +1e-32 on the norm when normalize=true.
        "normalize": bool(cfg.get("normalize", False)),
        "norm_epsilon": 1e-32,
        "drop_token_ids": [vocab[unk_token]],
        "tokenizer": {
            "type": "wordpiece",
            "lowercase": lowercase,
            "strip_accents": bool(strip_accents),
            "clean_text": bool(norm.get("clean_text", True)),
            "handle_chinese_chars": bool(norm.get("handle_chinese_chars", True)),
            "continuing_subword_prefix": model.get("continuing_subword_prefix", "##"),
            "unk_id": vocab[unk_token],
            "max_input_chars_per_word": int(model.get("max_input_chars_per_word", 100)),
        },
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    model_dir = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    tok = json.loads((model_dir / "tokenizer.json").read_text())
    cfg = json.loads((model_dir / "config.json").read_text())
    shape, matrix = read_safetensors_f32(model_dir / "model.safetensors", "embeddings")

    vocab: dict[str, int] = tok["model"]["vocab"]
    if len(vocab) != shape[0]:
        raise SystemExit(f"vocab size {len(vocab)} != embedding rows {shape[0]}")
    by_id = [""] * len(vocab)
    for token, idx in vocab.items():
        by_id[idx] = token

    header = build_header(tok, cfg, shape, source=str(cfg.get("tokenizer_name", model_dir.name)))
    header_bytes = json.dumps(header, separators=(",", ":"), sort_keys=True).encode()

    with open(out_path, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack("<I", len(header_bytes)))
        f.write(header_bytes)
        for token in by_id:
            b = token.encode()
            if len(b) > 0xFFFF:
                raise SystemExit(f"token too long: {token[:40]}...")
            f.write(struct.pack("<H", len(b)))
            f.write(b)
        f.write(matrix)

    digest = hashlib.sha256(out_path.read_bytes()).hexdigest()
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")
    print(f"sha256 {digest}")


if __name__ == "__main__":
    main()
