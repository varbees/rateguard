from __future__ import annotations

import json
from typing import TypeAlias

from ..core.utils import format_retry_after_ms, read_first_header
from ..types import AdmissionErrorCode, HeadersLike, PreflightDecision, RateLimitDecision, RequestContext, ResolvedRateGuardOptions

DenialPayload: TypeAlias = dict[str, str | int]


def denial_payload(status_code: int, retry_after_ms: int, error_code: AdmissionErrorCode | None = None) -> DenialPayload:
    payload: DenialPayload = {
        "error": error_code or ("rate_limit_exceeded" if status_code == 429 else "circuit_open"),
    }
    if retry_after_ms > 0:
        payload["retry_after_ms"] = retry_after_ms
    return payload


def denial_body(status_code: int, retry_after_ms: int, error_code: AdmissionErrorCode | None = None) -> bytes:
    return json.dumps(denial_payload(status_code, retry_after_ms, error_code)).encode()


def resolve_denial_body(preflight: PreflightDecision, status_code: int, retry_after_ms: int) -> bytes:
    """Picks the response body for a denied request: the pre-built
    {"error", "message"} payload for loop-detection/guardrail rejections
    when present, otherwise the standard {"error", "retry_after_ms"?} shape."""
    if preflight.rejection_payload is not None:
        return json.dumps(preflight.rejection_payload).encode()
    return denial_body(status_code, retry_after_ms, preflight.error_code)


def denial_headers(retry_after_ms: int) -> list[tuple[str, str]]:
    headers = [("Content-Type", "application/json")]
    if retry_after_ms > 0:
        headers.append(("Retry-After", format_retry_after_ms(retry_after_ms)))
        headers.append(("X-Retry-After-Ms", str(retry_after_ms)))
    return headers


def denial_asgi_headers(retry_after_ms: int) -> list[tuple[bytes, bytes]]:
    return [(name.lower().encode(), value.encode()) for name, value in denial_headers(retry_after_ms)]


def admission_headers(rate_limit: RateLimitDecision | None) -> list[tuple[str, str]]:
    """IETF RateLimit-* response headers (draft-ietf-httpapi-ratelimit-headers).

    Mirrors Go's sdk.go applyHeaders: set only when the rate limiter
    actually applied to this request (`rate_limit.applied`), on BOTH the
    allow and deny paths — computed once here so ASGI/WSGI can't drift
    from each other or from Go.
    """
    if rate_limit is None or not rate_limit.applied:
        return []
    remaining = max(0, rate_limit.remaining)
    retry_after_ms = rate_limit.retry_after_ms
    # Same whole-second ceiling as Retry-After/format_retry_after_ms,
    # except zero stays zero (Go's ceilDurationSeconds(d<=0) == 0) rather
    # than floored up to 1 the way format_retry_after_ms floors Retry-After.
    reset_seconds = format_retry_after_ms(retry_after_ms) if retry_after_ms > 0 else "0"
    return [
        ("RateLimit-Limit", str(rate_limit.limit)),
        ("RateLimit-Remaining", str(remaining)),
        ("RateLimit-Reset", reset_seconds),
    ]


def admission_asgi_headers(rate_limit: RateLimitDecision | None) -> list[tuple[bytes, bytes]]:
    return [(name.encode(), value.encode()) for name, value in admission_headers(rate_limit)]


def build_request_context(
    config: ResolvedRateGuardOptions,
    *,
    method: str,
    path: str,
    headers: HeadersLike,
) -> RequestContext:
    request_id = read_first_header(headers, ["x-request-id"]) or path
    trace_id = read_first_header(headers, ["traceparent", "x-trace-id", "x-request-id"]) or request_id
    return RequestContext(
        method=method.upper(),
        path=path,
        headers=headers,
        request_id=request_id,
        trace_id=trace_id,
        tenant_id=config.tenant_id,
        route_id=config.route_id,
        upstream_id=config.upstream_id,
        provider=config.provider,
        model=config.model,
    )
