"""
Semantic response caching — matching Go's semantic_cache.go exactly.

Exact-match caching misses the common case: two prompts that mean the same
thing but differ in wording never hit. Semantic caching embeds the prompt
and serves a prior response when a sufficiently similar prompt was already
answered — real cost and latency savings on workloads with duplicate intent
(support bots, agent retries, templated prompts with small variations).

RateGuard does not bundle an embedding model. That is a deliberate scope
decision, not an oversight: an embedding runtime (a hosted embeddings API,
a local sentence-transformer binding, an ONNX model) is exactly the kind of
external dependency RateGuard's "zero infrastructure, zero added attack
surface" positioning exists to avoid. Instead, Embedder is a one-method
protocol — bring the OpenAI/Cohere/Voyage embeddings API or anything else
that turns text into a vector. RateGuard supplies the cache: bounded
storage, cosine similarity search, TTL, and the transport wiring
(core/outbound.py) that skips the network entirely on a hit.

Honest scope: streaming requests ("stream": true) are never cached — a
cached response is a full JSON body, and replaying it as a fabricated SSE
stream would misrepresent timing (TTFT/TPOT) to the caller. Streaming
calls always execute for real.

Source (cosine similarity): https://en.wikipedia.org/wiki/Cosine_similarity
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from math import sqrt
from threading import Lock
from typing import Protocol

from ..types import Clock

_DEFAULT_SIMILARITY_THRESHOLD = 0.92
_DEFAULT_TTL_MS = 60 * 60 * 1000  # 1 hour
_DEFAULT_MAX_ENTRIES_PER_SCOPE = 500


class Embedder(Protocol):
    """Turns text into a vector embedding. Implementations decide the
    dimensionality and model; RateGuard only requires that equal-meaning
    text produce vectors with high cosine similarity. No default
    implementation ships — bring your own (OpenAI, Cohere, Voyage, a local
    model, ...)."""

    async def embed(self, text: str) -> list[float]: ...


@dataclass(slots=True)
class SemanticCacheOptions:
    """Configures semantic caching for one outbound transport. Passing
    None for semantic_cache on create_httpx_transport/
    create_httpx_async_transport disables caching entirely (the
    zero-risk default: no embedding calls, no memory overhead)."""

    # Required — there is no default embedding model.
    embedder: Embedder
    # Minimum cosine similarity (0-1) for a cache hit. Default 0.92 —
    # conservative; lower it deliberately per workload.
    similarity_threshold: float = _DEFAULT_SIMILARITY_THRESHOLD
    # How long a cached response stays eligible for reuse, in ms. Default
    # 1 hour.
    ttl_ms: float = _DEFAULT_TTL_MS
    # Bounds memory per provider+model scope. Default 500. Eviction is
    # oldest-first once the bound is hit — this is a cache, not a vector
    # database; workloads needing more should look upstream of RateGuard
    # (Redis, a real vector store) and are out of scope here.
    max_entries_per_scope: int = _DEFAULT_MAX_ENTRIES_PER_SCOPE

    def with_defaults(self) -> "SemanticCacheOptions":
        threshold = self.similarity_threshold if self.similarity_threshold > 0 else _DEFAULT_SIMILARITY_THRESHOLD
        ttl_ms = self.ttl_ms if self.ttl_ms > 0 else _DEFAULT_TTL_MS
        max_entries = self.max_entries_per_scope if self.max_entries_per_scope > 0 else _DEFAULT_MAX_ENTRIES_PER_SCOPE
        return SemanticCacheOptions(
            embedder=self.embedder,
            similarity_threshold=threshold,
            ttl_ms=ttl_ms,
            max_entries_per_scope=max_entries,
        )


@dataclass(slots=True)
class CachedResponse:
    """A previously observed LLM response, replayed byte-for-byte on a
    cache hit."""

    status_code: int
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""


@dataclass(slots=True)
class _CacheEntry:
    embedding: list[float]
    response: CachedResponse
    expires_at: float


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity of two equal-length vectors, or 0 for
    mismatched/empty/zero-norm inputs."""
    if not a or len(a) != len(b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (sqrt(norm_a) * sqrt(norm_b))


class SemanticCache:
    """The internal engine behind SemanticCacheOptions: a bounded,
    per-scope (provider:model) linear scan over embeddings. Linear scan is
    correct and simple at the size this cache is meant for (hundreds of
    entries per model, not millions) — an ANN index would be premature
    infrastructure for what is meant to be a zero-dependency, in-process
    cache."""

    def __init__(self, options: SemanticCacheOptions, clock: Clock) -> None:
        self._options = options.with_defaults()
        self._clock = clock
        self._lock = Lock()
        self._scopes: dict[str, list[_CacheEntry]] = {}

    async def embed(self, text: str) -> list[float]:
        """Delegates to the configured Embedder."""
        return await self._options.embedder.embed(text)

    def lookup(self, scope: str, embedding: list[float]) -> CachedResponse | None:
        """Returns the best matching cached response for embedding in
        scope, if its similarity meets the configured threshold. Expired
        entries are pruned lazily on access."""
        now = self._clock.now()

        with self._lock:
            entries = self._scopes.get(scope, [])
            if not entries:
                return None

            live: list[_CacheEntry] = []
            best: _CacheEntry | None = None
            best_score = -1.0
            for entry in entries:
                if now > entry.expires_at:
                    continue  # pruned: dropped from live
                live.append(entry)
                score = _cosine_similarity(embedding, entry.embedding)
                if score > best_score:
                    best_score = score
                    best = entry
            self._scopes[scope] = live

            if best is None or best_score < self._options.similarity_threshold:
                return None
            return best.response

    def store(self, scope: str, embedding: list[float], response: CachedResponse) -> None:
        """Records a fresh response under scope, keyed by its embedding.
        Oldest-first eviction keeps each scope within
        max_entries_per_scope."""
        with self._lock:
            entries = self._scopes.setdefault(scope, [])
            entries.append(
                _CacheEntry(
                    embedding=embedding,
                    response=response,
                    expires_at=self._clock.now() + self._options.ttl_ms,
                )
            )
            over = len(entries) - self._options.max_entries_per_scope
            if over > 0:
                del entries[:over]


# ── Request introspection for caching ──
# (Response usage extraction already exists in core/utils.py /
# core/outbound.py; these helpers are cache-specific: "is this cacheable"
# and "what's the prompt text to embed".)


def is_streaming_request_body(body_text: str) -> bool:
    """Reports whether the request body asked for a streamed response
    ("stream": true) — streaming requests are never cached."""
    if not body_text:
        return False
    try:
        payload = json.loads(body_text)
    except ValueError:
        return False
    if not isinstance(payload, dict):
        return False
    return bool(payload.get("stream", False))


def prompt_text_from_request_body(body_text: str) -> str:
    """Extracts a stable text representation of the prompt from an
    OpenAI- or Anthropic-shaped chat request body, for embedding.
    Multimodal parts other than text (images, audio) are ignored —
    semantic caching only reasons about text content."""
    if not body_text:
        return ""
    try:
        payload = json.loads(body_text)
    except ValueError:
        return ""
    if not isinstance(payload, dict):
        return ""

    lines: list[str] = []
    system_text = _content_text(payload.get("system"))
    if system_text:
        lines.append(f"system: {system_text}")

    messages = payload.get("messages")
    if isinstance(messages, list):
        for message in messages:
            if not isinstance(message, dict):
                continue
            text = _content_text(message.get("content"))
            if not text:
                continue
            role = message.get("role")
            if not isinstance(role, str):
                role = ""
            lines.append(f"{role}: {text}")

    if not lines:
        return ""
    return "".join(f"{line}\n" for line in lines)


def _content_text(content: object) -> str:
    """Decodes an OpenAI/Anthropic "content" field, which is either a
    plain string or a list of typed parts
    ({"type": "text", "text": "..."} plus non-text parts this ignores)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                text = part.get("text")
                if isinstance(text, str) and text:
                    parts.append(text)
        return " ".join(parts)
    return ""
