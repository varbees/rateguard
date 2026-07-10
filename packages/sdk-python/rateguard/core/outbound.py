"""
Outbound GenAI transport — matching Go's outbound.go and Node's outbound.ts.

Inbound middleware guards your API. Real LLM spend happens on OUTBOUND calls
to provider APIs. The OpenAI and Anthropic Python SDKs both run on httpx and
accept a custom client — one line wires RateGuard in:

    rg = RateGuard(preset="llm-heavy")
    client = OpenAI(http_client=rg.wrap_httpx_client())

Every LLM call is budgeted, breaker-protected, and metered with REAL token
usage — with optional fallback across OpenAI-compatible providers. No proxy
hop; runs in-process.

httpx is imported lazily: RateGuard keeps zero runtime dependencies, and the
wrapper activates only for users who already have httpx (every OpenAI /
Anthropic SDK user does).

Honest scope: automatic fallback only applies to OpenAI-compatible endpoints
(same request schema). Cross-schema fallback (OpenAI → Anthropic native) is
impossible at the transport layer and is NOT claimed.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from urllib.parse import unquote

from .circuit_breaker import CircuitBreaker
from .semantic_cache import CachedResponse, SemanticCache, SemanticCacheOptions, is_streaming_request_body, prompt_text_from_request_body
from .utils import extract_token_usage_from_text, format_retry_after_ms

if TYPE_CHECKING:
    from ..runtime import RateGuardRuntime
    from ..types import TokenUsage

_MAX_EXTRACT_BYTES = 1 << 20  # 1 MiB cap on JSON usage extraction
_MAX_SSE_CANDIDATES = 8
_MAX_SSE_LINE_BYTES = 256 << 10
_DEFAULT_OUTBOUND_ESTIMATED_TOKENS = 4096  # typical chat-call upper bound

# OpenAI-schema hosts (path-suffix matching covers Groq's /openai/v1/,
# Cohere's /compatibility/v1/, DashScope's /compatible-mode/v1/, DeepInfra's
# /v1/openai/, Z.AI's /api/paas/v4/, ...).
#
# Every host here was checked against that provider's own current API docs,
# not carried over from a list someone else compiled — two are deliberately
# NOT here despite both offering "OpenAI-compatible" access. See Go's
# outbound.go (the reference implementation) for why: Cloudflare AI Gateway's
# current recommended endpoint lives under Cloudflare's single shared
# general-purpose API host (used for DNS, Workers, R2, ...), not a dedicated
# LLM host, and its other endpoint shape embeds a per-customer account+
# gateway ID in the path itself — no fixed hostname to key off. IBM
# watsonx.ai's OpenAI-compatible "Model Gateway" is explicitly preview-status
# in IBM's own docs and split across region-specific hosts rather than one
# fixed host, the same shape as AWS Bedrock (a native, non-map-based
# adapter) — revisit once it reaches GA with a confirmed stable endpoint.
OPENAI_COMPATIBLE_HOSTS: dict[str, str] = {
    "api.openai.com": "openai",
    "api.deepseek.com": "deepseek",
    "api.groq.com": "groq",
    "api.mistral.ai": "mistral",
    "api.together.xyz": "together",
    "openrouter.ai": "openrouter",
    "api.x.ai": "xai",
    "api.perplexity.ai": "perplexity",
    "api.moonshot.ai": "moonshot",
    "api.fireworks.ai": "fireworks",
    "api.cerebras.ai": "cerebras",
    "api.cohere.ai": "cohere",
    "api.cohere.com": "cohere",
    "dashscope.aliyuncs.com": "dashscope",
    "api.sambanova.ai": "sambanova",
    "integrate.api.nvidia.com": "nvidia",
    "api.deepinfra.com": "deepinfra",
    "router.huggingface.co": "huggingface",
    "inference.baseten.co": "baseten",
    "api.tokenfactory.nebius.com": "nebius",
    "api.z.ai": "zai",
    "open.bigmodel.cn": "zai",
    "api.siliconflow.com": "siliconflow",
    "api.siliconflow.cn": "siliconflow",
    "router.requesty.ai": "requesty",
    "models.github.ai": "github",
}


@dataclass(slots=True)
class OutboundCall:
    """What provider detection learned about a request."""

    provider: str
    model: str = ""
    operation: str = "chat"
    compatible: bool = False
    path_suffix: str = ""


@dataclass(slots=True)
class FallbackProvider:
    """An OpenAI-compatible fallback target."""

    name: str
    base_url: str
    model: str = ""
    headers: dict[str, str] = field(default_factory=dict)


def detect_llm_call(host: str, path: str) -> OutboundCall | None:
    """Classify an outbound request. Returns None for non-LLM traffic."""
    provider = OPENAI_COMPATIBLE_HOSTS.get(host)
    if provider:
        if path.endswith("/chat/completions"):
            return OutboundCall(provider=provider, operation="chat", compatible=True, path_suffix=path)
        if path.endswith("/responses"):
            return OutboundCall(provider=provider, operation="chat", path_suffix=path)
        if path.endswith("/embeddings"):
            return OutboundCall(provider=provider, operation="embedding", path_suffix=path)
        if path.endswith("/completions"):
            return OutboundCall(provider=provider, operation="text_completion", compatible=True, path_suffix=path)
        return None

    if host == "api.anthropic.com" and path.endswith("/messages"):
        return OutboundCall(provider="anthropic", operation="chat", path_suffix=path)

    if host == "generativelanguage.googleapis.com":
        if path.endswith("/chat/completions"):
            return OutboundCall(provider="google", operation="chat", compatible=True, path_suffix=path)
        if ":generateContent" in path or ":streamGenerateContent" in path:
            return OutboundCall(provider="google", model=_google_model_from_path(path), operation="chat", path_suffix=path)
        return None

    if host.endswith("aiplatform.googleapis.com"):
        if ":generateContent" in path or ":streamGenerateContent" in path:
            return OutboundCall(provider="google_vertex", model=_google_model_from_path(path), operation="chat", path_suffix=path)
        return None

    if host.endswith(".openai.azure.com") or host.endswith(".cognitiveservices.azure.com"):
        if path.endswith("/chat/completions"):
            return OutboundCall(provider="azure_openai", operation="chat", compatible=True, path_suffix=path)
        if path.endswith("/embeddings"):
            return OutboundCall(provider="azure_openai", operation="embedding", path_suffix=path)
        return None

    if host.startswith("bedrock-runtime.") and host.endswith(".amazonaws.com"):
        marker = "/model/"
        idx = path.find(marker)
        if idx != -1:
            rest = path[idx + len(marker):]
            slash = rest.find("/")
            if slash != -1 and rest[slash + 1:] in ("converse", "invoke", "converse-stream", "invoke-with-response-stream"):
                return OutboundCall(provider="aws_bedrock", model=unquote(rest[:slash]), operation="chat", path_suffix=path)
        return None

    # Self-hosted OpenAI-compatible servers (vLLM, llama.cpp, LocalAI, ...).
    if path.endswith("/chat/completions"):
        return OutboundCall(provider=host, operation="chat", compatible=True, path_suffix=path)

    return None


def _google_model_from_path(path: str) -> str:
    marker = "/models/"
    idx = path.find(marker)
    if idx == -1:
        return ""
    rest = path[idx + len(marker):]
    colon = rest.find(":")
    return rest if colon == -1 else rest[:colon]


def _model_from_body(body: bytes) -> str:
    try:
        parsed = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return ""
    if isinstance(parsed, dict):
        model = parsed.get("model")
        if isinstance(model, str):
            return model.strip()
    return ""


def _extract_sse_usage(text: str) -> "TokenUsage | None":
    """Collect usage-bearing data lines (bounded) and merge them."""
    candidates: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("data:") or len(line) > _MAX_SSE_LINE_BYTES:
            continue
        payload = line[5:].strip()
        if not payload or payload == "[DONE]":
            continue
        if "usage" not in payload and "_tokens" not in payload and "TokenCount" not in payload:
            continue
        if len(candidates) >= _MAX_SSE_CANDIDATES:
            # Keep first half (Anthropic message_start) + most recent half.
            del candidates[_MAX_SSE_CANDIDATES // 2]
        candidates.append(payload)
    if not candidates:
        return None
    return extract_token_usage_from_text("\n".join(f"data: {c}" for c in candidates))


class _OutboundCore:
    """Transport-agnostic outbound logic shared by sync and async wrappers."""

    def __init__(
        self,
        runtime: "RateGuardRuntime",
        *,
        mode: str = "enforce",
        chain: list[FallbackProvider] | None = None,
        disable_rate_limit: bool = False,
        estimated_tokens: int = 0,
    ) -> None:
        self.runtime = runtime
        self.mode = mode if mode in ("enforce", "observe") else "enforce"
        self.chain = chain or []
        self.disable_rate_limit = disable_rate_limit
        # Zero falls back to the SDK-instance estimated_tokens_per_request
        # config, then to a sane hardcoded default; reserving the whole
        # remaining budget per call would serialize concurrent agents.
        # Negative → strict reserve-all. Mirrors Go's outbound.go Transport().
        if estimated_tokens == 0:
            estimated_tokens = runtime.config.estimated_tokens_per_request
        if estimated_tokens == 0:
            estimated_tokens = _DEFAULT_OUTBOUND_ESTIMATED_TOKENS
        self.estimated_tokens = max(estimated_tokens, 0)
        self._breakers: dict[str, CircuitBreaker] = {}

    @property
    def enforce(self) -> bool:
        return self.mode != "observe"

    def breaker_for(self, provider: str) -> CircuitBreaker:
        breaker = self._breakers.get(provider)
        if breaker is None:
            breaker = CircuitBreaker(self.runtime.config.clock, self.runtime.config.circuit_breaker)
            self._breakers[provider] = breaker
        return breaker

    def budget_key(self, call: OutboundCall) -> str:
        model = call.model or "default"
        return f"{self.runtime.config.tenant_id}:{call.provider}:{model}:outbound"

    def reserve(self, call: OutboundCall) -> Any:
        return self.runtime.token_budget.reserve(
            self.budget_key(call), self.runtime.config.token_budget, self.estimated_tokens
        )

    def finish(
        self,
        call: OutboundCall,
        reservation_id: str | None,
        usage: "TokenUsage | None",
        reserved_estimate: int = 0,
    ) -> None:
        # reserved_estimate is committed when real usage can't be measured (a
        # stream without include_usage, an over-cap body, an unrecognized
        # provider schema). Recording zero would let a runaway agent spend
        # without ever touching its budget — the exact denial-of-wallet this
        # guards against. Set the provider's usage emission (e.g.
        # stream_options.include_usage) for exact accounting; the estimate is
        # the floor that keeps enforcement from going blind.
        key = self.budget_key(call)
        if usage is not None and usage.total_tokens > 0:
            self.runtime.token_budget.commit_reservation(key, reservation_id, usage.total_tokens)
        elif reserved_estimate > 0:
            self.runtime.token_budget.commit_reservation(key, reservation_id, reserved_estimate)
        else:
            self.runtime.token_budget.release_reservation(key, reservation_id)

    def rate_limit_blocked(self, call: OutboundCall) -> tuple[bool, int]:
        if self.disable_rate_limit:
            return False, 0
        decision = self.runtime.rate_limiter.allow(f"outbound:{call.provider}", self.runtime.config.rate_limit)
        if decision.applied and not decision.allowed:
            return True, decision.retry_after_ms
        return False, 0

    def fallback_target(self, call: OutboundCall, depth: int, body: bytes | None) -> FallbackProvider | None:
        if not self.chain or not call.compatible or body is None:
            return None
        if depth >= len(self.chain):
            return None
        return self.chain[depth]

    @staticmethod
    def retarget_url_and_body(target: FallbackProvider, call: OutboundCall, body: bytes) -> tuple[str, bytes]:
        # OpenAI-SDK convention: base_url owns the version prefix; append only
        # the canonical operation suffix, not the original full path.
        suffix = "/chat/completions"
        if call.path_suffix.endswith("/completions") and not call.path_suffix.endswith("/chat/completions"):
            suffix = "/completions"
        url = target.base_url.rstrip("/") + suffix

        new_body = body
        if target.model:
            try:
                parsed = json.loads(body)
                if isinstance(parsed, dict):
                    parsed["model"] = target.model
                    new_body = json.dumps(parsed).encode()
            except (ValueError, UnicodeDecodeError):
                pass
        return url, new_body

    @staticmethod
    def is_provider_failure(status_code: int) -> bool:
        return status_code == 429 or status_code >= 500


def create_httpx_transport(
    runtime: "RateGuardRuntime",
    *,
    mode: str = "enforce",
    chain: list[FallbackProvider] | None = None,
    disable_rate_limit: bool = False,
    estimated_tokens: int = 0,
    transport: Any = None,
    semantic_cache: SemanticCacheOptions | None = None,
) -> Any:
    """Build a sync httpx transport with outbound GenAI tracking.

    Usage:
        transport = create_httpx_transport(rg.runtime)
        client = httpx.Client(transport=transport)
        openai = OpenAI(http_client=client)

    Pass semantic_cache=SemanticCacheOptions(embedder=...) to enable
    semantic response caching (core/semantic_cache.py) for this
    transport. None (default) disables it entirely — no embedding calls,
    no memory overhead. A hit skips the network call, the rate limiter,
    the circuit breaker, and the token budget entirely: it is a real
    dollar saved, not just a faster response. Streaming requests always
    bypass the cache.
    """
    try:
        import httpx
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "rateguard outbound tracking requires httpx (the OpenAI and "
            "Anthropic SDKs already depend on it): pip install httpx"
        ) from exc

    core = _OutboundCore(runtime, mode=mode, chain=chain, disable_rate_limit=disable_rate_limit, estimated_tokens=estimated_tokens)
    inner = transport or httpx.HTTPTransport()
    cache = SemanticCache(semantic_cache, runtime.config.clock) if semantic_cache is not None else None

    def synthesized(request: Any, status: int, code: str, message: str, retry_after_ms: int) -> Any:
        headers = {"content-type": "application/json", "x-rateguard-synthesized": "true"}
        if retry_after_ms > 0:
            headers["retry-after"] = format_retry_after_ms(retry_after_ms)
        payload = json.dumps({"error": {"type": code, "message": message, "source": "rateguard"}})
        return httpx.Response(status, headers=headers, content=payload.encode(), request=request)

    def cached_response_to_httpx(request: Any, cached: CachedResponse) -> Any:
        headers = dict(cached.headers)
        headers["x-rateguard-cache"] = "hit"
        return httpx.Response(cached.status_code, headers=headers, content=cached.body, request=request)

    class _ScanningByteStream(httpx.SyncByteStream):
        """Passes chunks through unchanged while scanning SSE lines for usage."""

        def __init__(self, source: Any, on_complete: Any) -> None:
            self._source = source
            self._on_complete = on_complete
            self._buffer: list[str] = []
            self._buffered_bytes = 0
            self._done = False

        def __iter__(self) -> Any:
            for chunk in self._source:
                if self._buffered_bytes < _MAX_EXTRACT_BYTES:
                    self._buffer.append(chunk.decode("utf-8", errors="replace"))
                    self._buffered_bytes += len(chunk)
                yield chunk
            self._finish()

        def _finish(self) -> None:
            if self._done:
                return
            self._done = True
            usage = _extract_sse_usage("".join(self._buffer)) if self._buffer else None
            self._buffer = []
            self._on_complete(usage)

        def close(self) -> None:
            self._finish()
            close = getattr(self._source, "close", None)
            if close is not None:
                close()

    class _GuardedTransport(httpx.BaseTransport):
        def handle_request(self, request: Any) -> Any:
            call = detect_llm_call(request.url.host, request.url.path)
            if call is None:
                return inner.handle_request(request)

            body = request.read()
            if call.model == "" and body:
                call.model = _model_from_body(body)

            if cache is not None:
                body_text = body.decode("utf-8", errors="replace") if body else ""
                if not is_streaming_request_body(body_text):
                    return self._execute_with_cache(request, body, body_text, call)

            return self._execute(request, body, call, 0)

        def _execute_with_cache(self, request: Any, body: bytes, body_text: str, call: OutboundCall) -> Any:
            """Checks the semantic cache before making the real call and
            stores a fresh successful response afterward. A hit bypasses
            _execute entirely — no breaker check, no rate limit, no token
            budget, no network call, because the whole point is that
            nothing was actually spent."""
            assert cache is not None
            scope = f"{call.provider}:{call.model or 'default'}"
            prompt = prompt_text_from_request_body(body_text)
            if not prompt:
                return self._execute(request, body, call, 0)

            try:
                # Embedder.embed is async-only (bring your own OpenAI/
                # Cohere/Voyage/local embedder); this sync transport runs
                # it to completion on a private event loop. Embedding
                # failure degrades to a real call — caching is a cost
                # optimization, never a reason to fail the request.
                embedding = asyncio.run(cache.embed(prompt))
            except Exception:
                return self._execute(request, body, call, 0)
            if not embedding:
                return self._execute(request, body, call, 0)

            cached = cache.lookup(scope, embedding)
            if cached is not None:
                return cached_response_to_httpx(request, cached)

            response = self._execute(request, body, call, 0)
            content_type = response.headers.get("content-type", "")
            if response.status_code != 200 or content_type.startswith("text/event-stream"):
                return response
            if response.headers.get("x-rateguard-synthesized") == "true":
                return response  # a rejection we synthesized ourselves — never cache it

            content = response.read()
            # `scope` was computed from the REQUESTED provider/model before
            # _execute() ran — but _execute() may have internally fallen
            # over to a different provider (retarget), which never mutates
            # the caller's `call` object (it builds an entirely new one for
            # the recursive call). Caching under the pre-fallback scope
            # meant a later request that still reaches the ORIGINAL
            # (now-recovered) provider could replay the FALLBACK provider's
            # answer. Recompute the scope from what actually served this
            # response.
            if response.headers.get("x-rateguard-fallback") == "true":
                served_provider = response.headers.get("x-rateguard-provider") or call.provider
                served_model = _model_from_body(content) or call.model or "default"
                scope = f"{served_provider}:{served_model}"
            cache.store(scope, embedding, CachedResponse(status_code=response.status_code, headers=dict(response.headers), body=content))
            return response

        def _execute(self, request: Any, body: bytes, call: OutboundCall, depth: int) -> Any:
            breaker = core.breaker_for(call.provider)
            breaker_decision = breaker.allow()
            # A half-open probe grant must be released if the rate limit or
            # token budget check below denies the request before it ever
            # reaches upstream — otherwise the probe slot leaks and this
            # provider's breaker wedges in half-open forever (see
            # CircuitBreaker.release_probe). probe_consumed is set True
            # right before the actual request goes out.
            probe_consumed = False
            try:
                if not breaker_decision.allowed:
                    target = core.fallback_target(call, depth, body)
                    if target is not None:
                        return self._retarget(request, body, call, target, depth)
                    if core.enforce:
                        return synthesized(request, 503, "circuit_open",
                                           f"rateguard: circuit open for provider {call.provider}",
                                           breaker_decision.retry_after_ms)

                blocked, retry_after_ms = core.rate_limit_blocked(call)
                if blocked and core.enforce:
                    return synthesized(request, 429, "rate_limit_exceeded",
                                       f"rateguard: outbound rate limit for provider {call.provider}", retry_after_ms)

                reservation = core.reserve(call)
                if reservation.decision.applied and not reservation.decision.allowed and core.enforce:
                    return synthesized(request, 429, "token_budget_exceeded",
                                       f"rateguard: outbound token budget exhausted for {call.provider}",
                                       reservation.decision.retry_after_ms)

                probe_consumed = True
                try:
                    response = inner.handle_request(request)
                except Exception:
                    breaker.record_outcome(False)
                    core.finish(call, reservation.reservation_id, None)
                    target = core.fallback_target(call, depth, body)
                    if target is not None:
                        return self._retarget(request, body, call, target, depth)
                    raise

                if core.is_provider_failure(response.status_code):
                    breaker.record_outcome(False)
                    core.finish(call, reservation.reservation_id, None)
                    target = core.fallback_target(call, depth, body)
                    if target is not None:
                        response.close()
                        return self._retarget(request, body, call, target, depth)
                    return response

                breaker.record_outcome(True)
            finally:
                if not probe_consumed and breaker_decision.probe_in_flight:
                    breaker.release_probe()

            content_type = response.headers.get("content-type", "")
            if content_type.startswith("text/event-stream"):
                # Streaming: tee the byte stream — the caller gets exact
                # bytes with no buffering delay; usage is merged at EOF.
                scanning = _ScanningByteStream(
                    response.stream,
                    lambda usage: core.finish(call, reservation.reservation_id, usage, reservation.reserved),
                )
                return httpx.Response(
                    response.status_code,
                    headers=response.headers,
                    stream=scanning,
                    request=request,
                    extensions=response.extensions,
                )

            content = response.read()
            usage: "TokenUsage | None" = None
            if len(content) <= _MAX_EXTRACT_BYTES:
                usage = extract_token_usage_from_text(content.decode("utf-8", errors="replace"))
            core.finish(call, reservation.reservation_id, usage, reservation.reserved)
            return response

        def _retarget(self, request: Any, body: bytes, call: OutboundCall, target: FallbackProvider, depth: int) -> Any:
            url, new_body = core.retarget_url_and_body(target, call, body)
            headers = dict(request.headers)
            # Provider credentials never transfer across providers. Strip
            # every known provider auth header convention, not just
            # authorization/x-api-key — Azure OpenAI authenticates via a
            # bare "api-key" header, which this list previously missed
            # entirely, leaking the Azure key to whichever provider was
            # failed over to.
            headers.pop("authorization", None)
            headers.pop("x-api-key", None)
            headers.pop("api-key", None)
            headers.pop("x-goog-api-key", None)
            headers.pop("content-length", None)
            headers.update(target.headers)
            headers["x-rateguard-fallback-from"] = call.provider

            next_request = httpx.Request(request.method, url, headers=headers, content=new_body)
            next_call = OutboundCall(
                provider=target.name,
                model=target.model or call.model,
                operation=call.operation,
                compatible=True,
                path_suffix=call.path_suffix,
            )
            response = self._execute(next_request, new_body, next_call, depth + 1)
            response.headers["x-rateguard-fallback"] = "true"
            response.headers["x-rateguard-provider"] = target.name
            return response

        def close(self) -> None:
            inner.close()

    return _GuardedTransport()


def create_httpx_async_transport(
    runtime: "RateGuardRuntime",
    *,
    mode: str = "enforce",
    chain: list[FallbackProvider] | None = None,
    disable_rate_limit: bool = False,
    estimated_tokens: int = 0,
    transport: Any = None,
    semantic_cache: SemanticCacheOptions | None = None,
) -> Any:
    """Build an async httpx transport with outbound GenAI tracking.

    Agent frameworks are async-first — the OpenAI Agents SDK, Pydantic AI,
    and LangChain's async paths all run on httpx.AsyncClient:

        transport = create_httpx_async_transport(rg.runtime)
        client = httpx.AsyncClient(transport=transport)
        set_default_openai_client(AsyncOpenAI(http_client=client))

    Pass semantic_cache=SemanticCacheOptions(embedder=...) to enable
    semantic response caching (core/semantic_cache.py) for this
    transport — see create_httpx_transport's docstring for the same
    option on the sync transport.
    """
    try:
        import httpx
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "rateguard outbound tracking requires httpx (the OpenAI and "
            "Anthropic SDKs already depend on it): pip install httpx"
        ) from exc

    core = _OutboundCore(runtime, mode=mode, chain=chain, disable_rate_limit=disable_rate_limit, estimated_tokens=estimated_tokens)
    inner = transport or httpx.AsyncHTTPTransport()
    cache = SemanticCache(semantic_cache, runtime.config.clock) if semantic_cache is not None else None

    def synthesized(request: Any, status: int, code: str, message: str, retry_after_ms: int) -> Any:
        headers = {"content-type": "application/json", "x-rateguard-synthesized": "true"}
        if retry_after_ms > 0:
            headers["retry-after"] = format_retry_after_ms(retry_after_ms)
        payload = json.dumps({"error": {"type": code, "message": message, "source": "rateguard"}})
        return httpx.Response(status, headers=headers, content=payload.encode(), request=request)

    def cached_response_to_httpx(request: Any, cached: CachedResponse) -> Any:
        headers = dict(cached.headers)
        headers["x-rateguard-cache"] = "hit"
        return httpx.Response(cached.status_code, headers=headers, content=cached.body, request=request)

    class _AsyncScanningByteStream(httpx.AsyncByteStream):
        """Passes chunks through unchanged while scanning SSE lines for usage."""

        def __init__(self, source: Any, on_complete: Any) -> None:
            self._source = source
            self._on_complete = on_complete
            self._buffer: list[str] = []
            self._buffered_bytes = 0
            self._done = False

        async def __aiter__(self) -> Any:
            async for chunk in self._source:
                if self._buffered_bytes < _MAX_EXTRACT_BYTES:
                    self._buffer.append(chunk.decode("utf-8", errors="replace"))
                    self._buffered_bytes += len(chunk)
                yield chunk
            self._finish()

        def _finish(self) -> None:
            if self._done:
                return
            self._done = True
            usage = _extract_sse_usage("".join(self._buffer)) if self._buffer else None
            self._buffer = []
            self._on_complete(usage)

        async def aclose(self) -> None:
            self._finish()
            aclose = getattr(self._source, "aclose", None)
            if aclose is not None:
                await aclose()

    class _GuardedAsyncTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: Any) -> Any:
            call = detect_llm_call(request.url.host, request.url.path)
            if call is None:
                return await inner.handle_async_request(request)

            body = await request.aread()
            if call.model == "" and body:
                call.model = _model_from_body(body)

            if cache is not None:
                body_text = body.decode("utf-8", errors="replace") if body else ""
                if not is_streaming_request_body(body_text):
                    return await self._execute_with_cache(request, body, body_text, call)

            return await self._execute(request, body, call, 0)

        async def _execute_with_cache(self, request: Any, body: bytes, body_text: str, call: OutboundCall) -> Any:
            """Async counterpart of the sync transport's
            _execute_with_cache — see its docstring."""
            assert cache is not None
            scope = f"{call.provider}:{call.model or 'default'}"
            prompt = prompt_text_from_request_body(body_text)
            if not prompt:
                return await self._execute(request, body, call, 0)

            try:
                embedding = await cache.embed(prompt)
            except Exception:
                # Embedding failure degrades to a real call — caching is a
                # cost optimization, never a reason to fail the request.
                return await self._execute(request, body, call, 0)
            if not embedding:
                return await self._execute(request, body, call, 0)

            cached = cache.lookup(scope, embedding)
            if cached is not None:
                return cached_response_to_httpx(request, cached)

            response = await self._execute(request, body, call, 0)
            content_type = response.headers.get("content-type", "")
            if response.status_code != 200 or content_type.startswith("text/event-stream"):
                return response
            if response.headers.get("x-rateguard-synthesized") == "true":
                return response  # a rejection we synthesized ourselves — never cache it

            content = await response.aread()
            # See the matching comment in the sync _execute_with_cache above:
            # scope must reflect whatever provider actually served the
            # response (fallback may have retargeted), not the one
            # originally requested.
            if response.headers.get("x-rateguard-fallback") == "true":
                served_provider = response.headers.get("x-rateguard-provider") or call.provider
                served_model = _model_from_body(content) or call.model or "default"
                scope = f"{served_provider}:{served_model}"
            cache.store(scope, embedding, CachedResponse(status_code=response.status_code, headers=dict(response.headers), body=content))
            return response

        async def _execute(self, request: Any, body: bytes, call: OutboundCall, depth: int) -> Any:
            breaker = core.breaker_for(call.provider)
            breaker_decision = breaker.allow()
            # See the matching comment in the sync _execute above: a
            # half-open probe grant must be released if the rate limit or
            # token budget check below denies the request before it ever
            # reaches upstream, or this provider's breaker wedges in
            # half-open forever.
            probe_consumed = False
            try:
                if not breaker_decision.allowed:
                    target = core.fallback_target(call, depth, body)
                    if target is not None:
                        return await self._retarget(request, body, call, target, depth)
                    if core.enforce:
                        return synthesized(request, 503, "circuit_open",
                                           f"rateguard: circuit open for provider {call.provider}",
                                           breaker_decision.retry_after_ms)

                blocked, retry_after_ms = core.rate_limit_blocked(call)
                if blocked and core.enforce:
                    return synthesized(request, 429, "rate_limit_exceeded",
                                       f"rateguard: outbound rate limit for provider {call.provider}", retry_after_ms)

                reservation = core.reserve(call)
                if reservation.decision.applied and not reservation.decision.allowed and core.enforce:
                    return synthesized(request, 429, "token_budget_exceeded",
                                       f"rateguard: outbound token budget exhausted for {call.provider}",
                                       reservation.decision.retry_after_ms)

                probe_consumed = True
                try:
                    response = await inner.handle_async_request(request)
                except Exception:
                    breaker.record_outcome(False)
                    core.finish(call, reservation.reservation_id, None)
                    target = core.fallback_target(call, depth, body)
                    if target is not None:
                        return await self._retarget(request, body, call, target, depth)
                    raise

                if core.is_provider_failure(response.status_code):
                    breaker.record_outcome(False)
                    core.finish(call, reservation.reservation_id, None)
                    target = core.fallback_target(call, depth, body)
                    if target is not None:
                        await response.aclose()
                        return await self._retarget(request, body, call, target, depth)
                    return response

                breaker.record_outcome(True)
            finally:
                if not probe_consumed and breaker_decision.probe_in_flight:
                    breaker.release_probe()

            content_type = response.headers.get("content-type", "")
            if content_type.startswith("text/event-stream"):
                scanning = _AsyncScanningByteStream(
                    response.stream,
                    lambda usage: core.finish(call, reservation.reservation_id, usage, reservation.reserved),
                )
                return httpx.Response(
                    response.status_code,
                    headers=response.headers,
                    stream=scanning,
                    request=request,
                    extensions=response.extensions,
                )

            content = await response.aread()
            usage: "TokenUsage | None" = None
            if len(content) <= _MAX_EXTRACT_BYTES:
                usage = extract_token_usage_from_text(content.decode("utf-8", errors="replace"))
            core.finish(call, reservation.reservation_id, usage, reservation.reserved)
            return response

        async def _retarget(self, request: Any, body: bytes, call: OutboundCall, target: FallbackProvider, depth: int) -> Any:
            url, new_body = core.retarget_url_and_body(target, call, body)
            headers = dict(request.headers)
            # Provider credentials never transfer across providers. Strip
            # every known provider auth header convention, not just
            # authorization/x-api-key — Azure OpenAI authenticates via a
            # bare "api-key" header, which this list previously missed
            # entirely, leaking the Azure key to whichever provider was
            # failed over to.
            headers.pop("authorization", None)
            headers.pop("x-api-key", None)
            headers.pop("api-key", None)
            headers.pop("x-goog-api-key", None)
            headers.pop("content-length", None)
            headers.update(target.headers)
            headers["x-rateguard-fallback-from"] = call.provider

            next_request = httpx.Request(request.method, url, headers=headers, content=new_body)
            next_call = OutboundCall(
                provider=target.name,
                model=target.model or call.model,
                operation=call.operation,
                compatible=True,
                path_suffix=call.path_suffix,
            )
            response = await self._execute(next_request, new_body, next_call, depth + 1)
            response.headers["x-rateguard-fallback"] = "true"
            response.headers["x-rateguard-provider"] = target.name
            return response

        async def aclose(self) -> None:
            aclose = getattr(inner, "aclose", None)
            if aclose is not None:
                await aclose()

    return _GuardedAsyncTransport()
