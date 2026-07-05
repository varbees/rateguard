from __future__ import annotations

from types import TracebackType
from typing import BinaryIO, Callable, Iterable, Iterator, Protocol, cast

from ..runtime import MAX_INSPECTED_BODY_BYTES, RateGuardRuntime
from ..types import CompletionObservation, HeaderValue, PreflightDecision, RateGuardOptions, RequestContext, ResponseSnapshot
from ._common import admission_headers, build_request_context, denial_headers, resolve_denial_body


ExcInfo = tuple[type[BaseException], BaseException, TracebackType] | None


class StartResponse(Protocol):
    def __call__(self, status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> Callable[[bytes], None] | None: ...


WSGIEnvironValue = str | bytes | int | bool | BinaryIO | None
WSGIEnviron = dict[str, WSGIEnvironValue]
WSGIApp = Callable[[WSGIEnviron, StartResponse], Iterable[bytes]]


class _ChainedInput:
    """File-like wrapper: serves a buffered prefix first, then continues
    reading from the original (partially-consumed) stream for the
    remainder — mirrors Go's io.MultiReader(bytes.NewReader(read), r.Body)
    reconstruction, so a wrapped WSGI app still sees the exact, full
    request body after RateGuard has inspected only the first
    MAX_INSPECTED_BODY_BYTES of it.
    """

    def __init__(self, prefix: bytes, remainder: BinaryIO) -> None:
        self._buffer = bytearray(prefix)
        self._remainder = remainder
        self._remainder_exhausted = False

    def _fill(self, target: int) -> None:
        while len(self._buffer) < target and not self._remainder_exhausted:
            chunk = self._remainder.read(65536)
            if not chunk:
                self._remainder_exhausted = True
                break
            self._buffer.extend(chunk)

    def _fill_all(self) -> None:
        if not self._remainder_exhausted:
            rest = self._remainder.read()
            if rest:
                self._buffer.extend(rest)
            self._remainder_exhausted = True

    def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            self._fill_all()
            data = bytes(self._buffer)
            del self._buffer[:]
            return data
        self._fill(size)
        data = bytes(self._buffer[:size])
        del self._buffer[:size]
        return data

    def readline(self, size: int = -1) -> bytes:
        while b"\n" not in self._buffer and not self._remainder_exhausted:
            chunk = self._remainder.read(65536)
            if not chunk:
                self._remainder_exhausted = True
                break
            self._buffer.extend(chunk)
        idx = self._buffer.find(b"\n")
        end = idx + 1 if idx != -1 else len(self._buffer)
        if size is not None and size >= 0:
            end = min(end, size)
        data = bytes(self._buffer[:end])
        del self._buffer[:end]
        return data

    def __iter__(self) -> Iterator[bytes]:
        return self

    def __next__(self) -> bytes:
        line = self.readline()
        if not line:
            raise StopIteration
        return line


class RateGuardMiddleware:
    def __init__(self, app: WSGIApp, *, api_key: str | None = None, preset: str | None = None, guard: RateGuardRuntime | RateGuardOptions | None = None) -> None:
        self.app = app
        if isinstance(guard, RateGuardRuntime):
            self.guard = guard
        elif isinstance(guard, RateGuardOptions):
            self.guard = RateGuardRuntime(guard)
        else:
            self.guard = RateGuardRuntime(RateGuardOptions(api_key=api_key, preset=preset))

    def __call__(self, environ: WSGIEnviron, start_response: StartResponse) -> Iterable[bytes]:
        request = self._build_request(environ)
        started_at = self.guard.config.clock.now()

        body_text: str | None = None
        if self.guard.wants_request_body(request):
            body_text = self._read_bounded_body(environ, MAX_INSPECTED_BODY_BYTES)

        preflight = self.guard.admit(request, body_text)
        if not preflight.allowed:
            return self._deny(start_response, preflight)

        captured_status = 200
        captured_headers: list[tuple[str, str]] = []
        extra_headers = admission_headers(preflight.rate_limit)

        def wrapped_start_response(status: str, headers: list[tuple[str, str]], exc_info: ExcInfo = None) -> Callable[[bytes], None] | None:
            nonlocal captured_status, captured_headers
            captured_status = int(status.split(" ", 1)[0])
            captured_headers = headers
            outgoing = headers + extra_headers if extra_headers else headers
            return start_response(status, outgoing, exc_info)

        body = b"".join(self.app(environ, wrapped_start_response))
        snapshot = ResponseSnapshot(headers={k: v for k, v in captured_headers}, body=body.decode("utf-8", "replace"), status_code=captured_status)
        self.guard.observe(
            request,
            CompletionObservation(
                status_code=captured_status,
                snapshot=snapshot,
                token_budget_reservation_id=preflight.token_budget_reservation_id,
            ),
            started_at,
        )
        return [body]

    def _deny(self, start_response: StartResponse, preflight: PreflightDecision) -> list[bytes]:
        status_code = preflight.status_code or 429
        retry_after_ms = preflight.retry_after_ms or 0
        headers = denial_headers(retry_after_ms) + admission_headers(preflight.rate_limit)
        start_response(f"{status_code} ERROR", headers)
        return [resolve_denial_body(preflight, status_code, retry_after_ms)]

    def _build_request(self, environ: WSGIEnviron) -> RequestContext:
        path = str(environ.get("PATH_INFO") or "/")
        method = str(environ.get("REQUEST_METHOD") or "GET").upper()
        headers = self._headers(environ)
        return build_request_context(
            self.guard.config,
            method=method,
            path=path,
            headers=headers,
        )

    def _headers(self, environ: WSGIEnviron) -> dict[str, HeaderValue]:
        headers: dict[str, HeaderValue] = {}
        for key, value in environ.items():
            if key.startswith("HTTP_") and isinstance(value, str):
                header = key[5:].replace("_", "-").lower()
                headers[header] = value
        return headers

    def _read_bounded_body(self, environ: WSGIEnviron, max_bytes: int) -> str:
        """Reads up to `max_bytes` from `environ['wsgi.input']` for
        inspection, then substitutes a chained reader back into environ so
        the wrapped WSGI app still sees the exact, full request body —
        mirrors Go's io.LimitReader + io.MultiReader reconstruction in
        sdk.go's checkRequestBody."""
        stream = cast("BinaryIO | None", environ.get("wsgi.input"))
        if stream is None or not hasattr(stream, "read"):
            return ""
        raw = stream.read(max_bytes)
        prefix = bytes(raw) if isinstance(raw, (bytes, bytearray)) else b""
        environ["wsgi.input"] = cast(BinaryIO, _ChainedInput(prefix, stream))
        return prefix.decode("utf-8", "replace")
