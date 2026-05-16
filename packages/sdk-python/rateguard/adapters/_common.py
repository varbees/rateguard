from __future__ import annotations

import json
from typing import TypeAlias

from ..core.utils import format_retry_after_ms, read_first_header
from ..types import AdmissionErrorCode, HeadersLike, RequestContext, ResolvedRateGuardOptions

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


def denial_headers(retry_after_ms: int) -> list[tuple[str, str]]:
    headers = [("Content-Type", "application/json")]
    if retry_after_ms > 0:
        headers.append(("Retry-After", format_retry_after_ms(retry_after_ms)))
        headers.append(("X-Retry-After-Ms", str(retry_after_ms)))
    return headers


def denial_asgi_headers(retry_after_ms: int) -> list[tuple[bytes, bytes]]:
    return [(name.lower().encode(), value.encode()) for name, value in denial_headers(retry_after_ms)]


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
